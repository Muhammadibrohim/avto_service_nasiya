import { useState } from "react";
import { api, useApi } from "../api";
import { useApp } from "../nav";
import { confirmDialog, haptic } from "../telegram";
import { date, dateTime, dueLabel, methodLabel, phone, som, STATUS, vehicleName } from "../format";
import type { CustomerDetail, Vehicle } from "../types";
import { Card, Disclosure, Empty, ErrorBox, Loading, Msg, Row, SectionTitle } from "../components/ui";
import { PayForm } from "../components/PayForm";
import { VehicleForm } from "../components/VehicleForm";

export function CustomerProfile({ id }: { id: string }) {
  const { go, back, isManager } = useApp();
  const { data: c, error, loading, reload } = useApi<CustomerDetail>(`/customers/${id}`);
  const [editing, setEditing] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !c) return <Loading />;
  if (!c) return null;

  const payments = c.orders.flatMap((o) => (o.payments ?? []).map((p) => ({ ...p, order: o })))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  const remove = async () => {
    if (!(await confirmDialog(`${c.name} o‘chirilsinmi?`))) return;
    try { await api(`/customers/${c.id}`, { method: "DELETE" }); haptic("success"); back(); }
    catch (e) { haptic("error"); alert((e as Error).message); }
  };

  return (
    <section>
      <section className="hero">
        <span>MIJOZ PROFILI</span>
        <strong>{c.name}</strong>
        <p>{c.phone ? <a href={`tel:+${c.phone}`}>📞 {phone(c.phone)}</a> : "Telefon kiritilmagan"}{c.notes && <><br />📝 {c.notes}</>}</p>
        <div className="hero-actions">
          <button className="chip" onClick={() => setEditing(!editing)}>✎ Tahrirlash</button>
          <button className="chip accent" onClick={() => go({ name: "newOrder", customerId: c.id })}>＋ Servis</button>
          {isManager && !c.orders.length && <button className="chip danger" onClick={remove}>O‘chirish</button>}
        </div>
      </section>
      {editing && <EditCustomer c={c} onSaved={() => { setEditing(false); reload(); }} />}

      <div className="grid">
        <Card n={som(c.summary.debt)} t="Qarz" tone={c.summary.debt > 0 ? "warn" : "ok"} />
        <Card n={som(c.summary.paid)} t="To‘langan" />
        <Card n={som(c.summary.total)} t="Jami servis" />
        <Card n={c.orders.length} t="Servislar soni" />
      </div>

      <PayForm customerId={c.id} orders={c.orders} onPaid={reload} />

      <SectionTitle title="Avtomobillar" count={c.vehicles.length} />
      <div className="list">
        {c.vehicles.map((v) => (
          <Row key={v.id} onClick={() => setEditVehicle(editVehicle?.id === v.id ? null : v)}
            title={`🚗 ${vehicleName(v)}`}
            sub={[v.plate, v.year, v.color, v.mileage ? `${v.mileage.toLocaleString("ru-RU")} km` : null].filter(Boolean).join(" · ")}
            right={<span className="muted">✎</span>} />
        ))}
      </div>
      {editVehicle && <section className="panel"><VehicleForm key={editVehicle.id} customerId={c.id} vehicle={editVehicle} onSaved={() => { setEditVehicle(null); reload(); }} /></section>}
      <Disclosure label="＋ AVTOMOBIL QO‘SHISH" openLabel="✕ BEKOR QILISH">
        <VehicleForm customerId={c.id} onSaved={reload} />
      </Disclosure>

      <SectionTitle title="Servislar" count={c.orders.length} />
      <div className="list">
        {c.orders.map((o) => (
          <Row key={o.id} onClick={() => go({ name: "order", id: o.id })}
            className={o.status === "cancelled" ? "cancelled" : ""}
            title={`${o.vehicle?.plate ?? "—"} · ${date(o.createdAt)}`}
            sub={`${STATUS[o.status]}${Number(o.debt) > 0 ? " · " + dueLabel(o.dueDate) : ""} · ${o.items?.map((i) => i.name).join(", ")}`}
            right={Number(o.debt) > 0 ? <span className="debt">{som(o.debt)}</span> : som(o.total)} />
        ))}
        {!c.orders.length && <Empty>Hali servis yo‘q</Empty>}
      </div>

      <SectionTitle title="To‘lovlar tarixi" count={payments.length} />
      <div className="list">
        {payments.map((p) => (
          <Row key={p.id} onClick={() => go({ name: "order", id: p.orderId })}
            title={`💰 ${som(p.amount)}`}
            sub={`${dateTime(p.createdAt)} · ${p.order.vehicle?.plate ?? ""} · ${p.note || "To‘lov"}`}
            right={<span className="muted">{methodLabel(p.method)}</span>} />
        ))}
        {!payments.length && <Empty>Hali to‘lov kiritilmagan</Empty>}
      </div>
    </section>
  );
}

function EditCustomer({ c, onSaved }: { c: CustomerDetail; onSaved: () => void }) {
  const [name, setName] = useState(c.name);
  const [ph, setPh] = useState(c.phone ?? "");
  const [notes, setNotes] = useState(c.notes ?? "");
  const [msg, setMsg] = useState("");
  const save = async () => {
    try {
      await api(`/customers/${c.id}`, { method: "PATCH", body: { name, phone: ph, notes } });
      haptic("success"); onSaved();
    } catch (e) { setMsg("❌ " + (e as Error).message); }
  };
  return (
    <section className="panel">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ism" />
      <input value={ph} inputMode="tel" onChange={(e) => setPh(e.target.value)} placeholder="Telefon" />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Izoh" rows={2} />
      <button className="primary" onClick={save}>SAQLASH</button>
      <Msg text={msg} />
    </section>
  );
}
