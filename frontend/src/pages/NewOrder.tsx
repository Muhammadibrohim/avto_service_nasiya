import { useState } from "react";
import { api, useApi } from "../api";
import { useApp } from "../nav";
import { useDebounced } from "../hooks";
import { haptic } from "../telegram";
import { isoDay, phone, som, vehicleName } from "../format";
import type { Customer, CustomerDetail, Method, Order } from "../types";
import { Empty, Field, MethodPicker, MoneyInput, Msg, Row, SectionTitle } from "../components/ui";
import { CustomerForm } from "../components/CustomerForm";
import { VehicleForm } from "../components/VehicleForm";
import { draftTotal, ItemsEditor, type DraftItem } from "../components/ItemsEditor";

const DUE_PRESETS = [3, 7, 14, 30];

export function NewOrder(p: { customerId?: string; vehicleId?: string }) {
  const { go } = useApp();
  const [customerId, setCustomerId] = useState(p.customerId ?? "");
  const [vehicleId, setVehicleId] = useState(p.vehicleId ?? "");
  const [newCustomer, setNewCustomer] = useState(false);
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim());
  const search = useApi<Customer[]>(customerId || newCustomer ? null : `/customers?take=20${query ? `&q=${encodeURIComponent(query)}` : ""}`);
  const customer = useApi<CustomerDetail>(customerId ? `/customers/${customerId}` : null);
  const c = customer.data?.id === customerId ? customer.data : null;

  const [items, setItems] = useState<DraftItem[]>([]);
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [due, setDue] = useState("");
  const [mileage, setMileage] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const total = draftTotal(items);
  const debt = Math.max(0, total - Number(paid || 0));

  const pickCustomer = (id: string, vId = "") => { setCustomerId(id); setVehicleId(vId); setNewCustomer(false); setQ(""); setMsg(""); };

  const submit = async () => {
    if (!customerId || !vehicleId) return setMsg("Mijoz va avtomobilni tanlang");
    if (!items.length) return setMsg("Kamida bitta ish yoki detal qo‘shing");
    setBusy(true); setMsg("");
    try {
      const order = await api<Order>("/orders", {
        method: "POST",
        body: { customerId, vehicleId, items, paid: Number(paid || 0), paymentMethod: method, dueDate: debt > 0 ? due || null : null, mileage: mileage || null, note },
      });
      haptic("success");
      go({ name: "order", id: order.id });
    } catch (e) {
      haptic("error");
      setMsg("❌ " + (e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <section>
      <SectionTitle title="Yangi servis" />

      {!customerId && !newCustomer && (
        <>
          <button className="primary" onClick={() => setNewCustomer(true)}>＋ YANGI MIJOZ</button>
          <input className="search" placeholder="🔎 Mavjud mijoz: ism, telefon yoki raqam" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="list">
            {search.data?.map((x) => (
              <Row key={x.id} onClick={() => pickCustomer(x.id, x.vehicles.length === 1 ? x.vehicles[0].id : "")}
                title={x.name} sub={`${phone(x.phone)} · ${x.vehicles.map((v) => v.plate).join(", ") || "avtomobilsiz"}`}
                right={x.debt ? <span className="debt">{som(x.debt)}</span> : undefined} />
            ))}
            {search.data && !search.data.length && <Empty>Mijoz topilmadi</Empty>}
          </div>
        </>
      )}

      {newCustomer && (
        <section className="panel">
          <CustomerForm submitLabel="MIJOZNI SAQLASH VA DAVOM ETISH" onCreated={(x) => pickCustomer(x.id, x.vehicles[0]?.id)} />
          <button className="link" onClick={() => setNewCustomer(false)}>← Mavjud mijozlardan tanlash</button>
        </section>
      )}

      {c && (
        <>
          <div className="panel selected">
            <div><b>👤 {c.name}</b><small>{phone(c.phone)}{c.summary.debt > 0 && <> · <span className="debt">qarz {som(c.summary.debt)}</span></>}</small></div>
            {!p.customerId && <button className="link" onClick={() => pickCustomer("")}>O‘zgartirish</button>}
          </div>

          {c.vehicles.length > 0 && (
            <div className="chips">
              {c.vehicles.map((v) => (
                <button key={v.id} className={`chip big ${vehicleId === v.id ? "chosen" : ""}`} onClick={() => setVehicleId(v.id)}>
                  🚗 {vehicleName(v)} <b>{v.plate}</b>
                </button>
              ))}
            </div>
          )}
          {!c.vehicles.length && <section className="panel"><h3>🚗 Avtomobil qo‘shing</h3><VehicleForm customerId={c.id} onSaved={(v) => { customer.reload(); setVehicleId(v.id); }} /></section>}
        </>
      )}

      {c && vehicleId && (
        <>
          <SectionTitle title="Ishlar va detallar" count={items.length} />
          <ItemsEditor items={items} onChange={setItems} />

          <SectionTitle title="To‘lov" />
          <Field label="Hozir to‘landi (so‘m)">
            <div className="pay-amount-row">
              <MoneyInput placeholder="0" value={paid} onChange={setPaid} />
              <button type="button" className="chip" onClick={() => setPaid(String(total))}>Hammasi</button>
            </div>
          </Field>
          {Number(paid) > 0 && <MethodPicker value={method} onChange={setMethod} />}
          {debt > 0 && (
            <Field label={`Nasiya: ${som(debt)} — qachongacha?`}>
              <input type="date" value={due} min={isoDay(new Date())} onChange={(e) => setDue(e.target.value)} />
              <div className="chips">
                {DUE_PRESETS.map((d) => {
                  const v = isoDay(new Date(Date.now() + d * 86400000));
                  return <button key={d} className={`chip ${due === v ? "chosen" : ""}`} onClick={() => setDue(v)}>+{d} kun</button>;
                })}
              </div>
            </Field>
          )}
          <div className="two">
            <input placeholder="Probeg, km" inputMode="numeric" value={mileage} onChange={(e) => setMileage(e.target.value.replace(/\D/g, ""))} />
            <input placeholder="Izoh" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button className="primary" disabled={busy || !items.length} onClick={submit}>
            {busy ? "Saqlanmoqda..." : `SERVISNI SAQLASH · ${som(total)}`}
          </button>
        </>
      )}
      <Msg text={msg} />
    </section>
  );
}
