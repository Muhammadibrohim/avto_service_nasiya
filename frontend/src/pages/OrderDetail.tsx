import { useState } from "react";
import { api, useApi } from "../api";
import { useApp } from "../nav";
import { confirmDialog, haptic, tg } from "../telegram";
import { date, dateTime, dueLabel, isoDay, methodLabel, money, phone, som, STATUS, vehicleName } from "../format";
import type { Order } from "../types";
import { Card, ErrorBox, Field, Loading, Msg, Row, SectionTitle } from "../components/ui";
import { PayForm } from "../components/PayForm";
import { ItemsEditor, type DraftItem } from "../components/ItemsEditor";

function receipt(o: Order, workshop: string) {
  const lines = (o.items ?? []).map((i) => `• ${i.name} — ${money(i.quantity)} × ${money(i.unitPrice)} = ${som(i.total)}`);
  return [
    `🔧 ${workshop}`,
    `Servis: ${date(o.createdAt)}`,
    `Avtomobil: ${vehicleName(o.vehicle)} ${o.vehicle?.plate ?? ""}`,
    "",
    ...lines,
    "",
    `Jami: ${som(o.total)}`,
    `To‘landi: ${som(o.paid)}`,
    Number(o.debt) > 0 ? `Qarz: ${som(o.debt)}${o.dueDate ? ` (${date(o.dueDate)} gacha)` : ""}` : "✅ To‘liq to‘langan",
  ].join("\n");
}

export function OrderDetail({ id }: { id: string }) {
  const { go, isManager, session } = useApp();
  const { data: o, setData, error, loading, reload } = useApi<Order>(`/orders/${id}`);
  const [editItems, setEditItems] = useState<DraftItem[] | null>(null);
  const [msg, setMsg] = useState("");

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !o) return <Loading />;
  if (!o) return null;
  const cancelled = o.status === "cancelled";

  const patch = async (body: object, okText = "✅ Saqlandi") => {
    setMsg("");
    try { setData(await api<Order>(`/orders/${o.id}`, { method: "PATCH", body })); haptic("success"); setMsg(okText); return true; }
    catch (e) { haptic("error"); setMsg("❌ " + (e as Error).message); return false; }
  };

  const voidPayment = async (pid: string, amount: string | number) => {
    if (!(await confirmDialog(`${som(amount)} to‘lov o‘chirilsinmi? Summa qarzga qaytadi.`))) return;
    try { setData(await api<Order>(`/payments/${pid}`, { method: "DELETE" })); haptic("success"); }
    catch (e) { setMsg("❌ " + (e as Error).message); }
  };

  const cancel = async () => {
    if (!(await confirmDialog("Servis bekor qilinsinmi? Ishlatilgan detallar omborga qaytadi."))) return;
    try { setData(await api<Order>(`/orders/${o.id}/cancel`, { method: "POST", body: {} })); haptic("success"); }
    catch (e) { setMsg("❌ " + (e as Error).message); }
  };

  const share = () => {
    const text = receipt(o, session.workshop?.name ?? "Avto servis");
    const url = `https://t.me/share/url?url=${encodeURIComponent(" ")}&text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else navigator.clipboard?.writeText(text).then(() => setMsg("✅ Chek nusxalandi"));
  };

  return (
    <section>
      <section className={`hero ${cancelled ? "muted-hero" : ""}`}>
        <span>SERVIS · {STATUS[o.status].toUpperCase()}</span>
        <strong>{vehicleName(o.vehicle)} · {o.vehicle?.plate}</strong>
        <p>
          <button className="link inline" onClick={() => go({ name: "customer", id: o.customerId })}>👤 {o.customer?.name}</button> · {phone(o.customer?.phone)}
          <br />🗓 {dateTime(o.createdAt)}{o.createdBy?.name && ` · ${o.createdBy.name}`}{o.mileage ? ` · ${o.mileage.toLocaleString("ru-RU")} km` : ""}
        </p>
        <div className="hero-actions">
          <button className="chip" onClick={share}>📤 Chek</button>
          {!cancelled && <button className="chip" onClick={() => go({ name: "newOrder", customerId: o.customerId, vehicleId: o.vehicleId })}>↻ Yana servis</button>}
          {!cancelled && <button className="chip" onClick={() => patch({ status: o.status === "in_progress" ? "open" : "in_progress" })}>{o.status === "in_progress" ? "■ Jarayon tugadi" : "▶ Jarayonda"}</button>}
          {isManager && !cancelled && !o.payments?.length && <button className="chip danger" onClick={cancel}>Bekor qilish</button>}
        </div>
      </section>
      {cancelled && <div className="error">Bekor qilingan{o.cancelNote ? `: ${o.cancelNote}` : ""}</div>}

      <div className="grid">
        <Card n={som(o.total)} t="Jami" />
        <Card n={som(o.debt)} t={Number(o.debt) > 0 ? dueLabel(o.dueDate) : "Qarz yo‘q"} tone={Number(o.debt) > 0 ? "warn" : "ok"} />
      </div>

      <SectionTitle title="Ishlar va detallar" count={o.items?.length}
        action={isManager && !cancelled && !editItems ? <button className="link" onClick={() => setEditItems((o.items ?? []).map((i) => ({ name: i.name, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), serviceId: i.serviceId, partId: i.partId })))}>✎ Tahrirlash</button> : undefined} />
      {editItems ? (
        <section className="panel">
          <ItemsEditor items={editItems} onChange={setEditItems} />
          <button className="primary" onClick={async () => { if (await patch({ items: editItems })) setEditItems(null); }}>NARXLARNI SAQLASH</button>
          <button className="link" onClick={() => setEditItems(null)}>Bekor qilish</button>
        </section>
      ) : (
        <div className="list">
          {o.items?.map((i) => <Row key={i.id} title={i.name} sub={`${money(i.quantity)} × ${som(i.unitPrice)}`} right={som(i.total)} />)}
        </div>
      )}

      {!cancelled && Number(o.debt) > 0 && <PayForm customerId={o.customerId} orders={[o]} fixedOrderId={o.id} onPaid={reload} />}

      {!cancelled && <OrderMeta o={o} onSave={patch} />}
      <Msg text={msg} />

      <SectionTitle title="To‘lovlar" count={o.payments?.length ?? 0} />
      <div className="list">
        {o.payments?.map((p) => (
          <div className="row" key={p.id}>
            <div className="row-main"><b>💰 {som(p.amount)} · {methodLabel(p.method)}</b><small>{dateTime(p.createdAt)} · {p.note || "To‘lov"}{p.createdBy?.name ? ` · ${p.createdBy.name}` : ""}</small></div>
            {isManager && !cancelled && <button className="remove" onClick={() => voidPayment(p.id, p.amount)} aria-label="To‘lovni o‘chirish">✕</button>}
          </div>
        ))}
        {!o.payments?.length && <div className="empty">To‘lov yo‘q</div>}
      </div>
    </section>
  );
}

function OrderMeta({ o, onSave }: { o: Order; onSave: (b: object) => Promise<boolean> }) {
  const [due, setDue] = useState(o.dueDate ? o.dueDate.slice(0, 10) : "");
  const [note, setNote] = useState(o.note ?? "");
  const changed = due !== (o.dueDate ? o.dueDate.slice(0, 10) : "") || note !== (o.note ?? "");
  return (
    <section className="panel">
      {Number(o.debt) > 0 && <Field label="To‘lov muddati" hint="Bo‘sh qoldirilsa — bugundan 7 kun"><input type="date" value={due} min={isoDay(new Date())} onChange={(e) => setDue(e.target.value)} /></Field>}
      <Field label="Izoh"><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {changed && <button className="primary" onClick={() => onSave({ dueDate: due || null, note })}>SAQLASH</button>}
    </section>
  );
}
