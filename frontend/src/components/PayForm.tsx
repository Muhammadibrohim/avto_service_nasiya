import { useState } from "react";
import { api } from "../api";
import { haptic } from "../telegram";
import { som } from "../format";
import type { Method, Order } from "../types";
import { MethodPicker, Msg, MoneyInput } from "./ui";

/**
 * Accepts a payment either against one order, or (orderId = "all") across all
 * of a customer's debts starting from the oldest.
 */
export function PayForm(p: { customerId: string; orders: Order[]; fixedOrderId?: string; onPaid: () => void }) {
  const open = p.orders.filter((o) => o.status !== "cancelled" && Number(o.debt) > 0);
  const totalDebt = open.reduce((s, o) => s + Number(o.debt), 0);
  const defaultId = p.fixedOrderId ?? (open.length > 1 ? "all" : open[0]?.id ?? "");
  const [picked, setOrderId] = useState(defaultId);
  // after a payment the picked order may be closed — fall back to a valid choice
  const orderId = picked === "all" ? (open.length > 1 ? "all" : open[0]?.id ?? "") : open.some((o) => o.id === picked) ? picked : defaultId;
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (!open.length) return <div className="pay-empty">🎉 To‘lanmagan qarz yo‘q.</div>;
  const selected = open.find((o) => o.id === orderId);
  const limit = orderId === "all" ? totalDebt : Number(selected?.debt ?? 0);

  const pay = async () => {
    const value = Number(amount);
    if (!value || value <= 0) return setMsg("To‘lov summasini kiriting");
    if (value > limit) return setMsg("Summa qolgan qarzdan oshmasligi kerak");
    setBusy(true); setMsg("");
    try {
      const body = { amount: value, method, note: note.trim() || null };
      if (orderId === "all") await api(`/customers/${p.customerId}/pay`, { method: "POST", body });
      else await api("/payments", { method: "POST", body: { ...body, orderId } });
      haptic("success");
      setAmount(""); setNote("");
      setMsg(`✅ ${som(value)} qabul qilindi`);
      p.onPaid();
    } catch (e) {
      haptic("error");
      setMsg("❌ " + (e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <section className="pay">
      <div className="pay-head"><div><span>TO‘LOV QABUL QILISH</span><h3>Mijozdan to‘lov olish</h3></div><div className="pay-icon" aria-hidden="true">＋</div></div>
      {!p.fixedOrderId && open.length > 1 && (
        <select value={orderId} onChange={(e) => { setOrderId(e.target.value); setMsg(""); }}>
          <option value="all">Barcha qarzlar (eskisidan boshlab)</option>
          {open.map((o) => <option key={o.id} value={o.id}>{o.vehicle?.plate ?? "Raqamsiz"} · qarz {som(o.debt)}</option>)}
        </select>
      )}
      <div className="pay-balance"><span>Qolgan qarz</span><strong>{som(limit)}</strong></div>
      <div className="pay-amount-row">
        <MoneyInput className="pay-amount" placeholder="Summa, so‘m" value={amount} onChange={setAmount} />
        <button type="button" className="chip" onClick={() => setAmount(String(limit))}>Hammasi</button>
      </div>
      <MethodPicker value={method} onChange={setMethod} />
      <input placeholder="Izoh (ixtiyoriy)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="pay-submit" disabled={busy} onClick={pay}>{busy ? "Saqlanmoqda..." : "TO‘LOVNI SAQLASH"}</button>
      <Msg text={msg} />
    </section>
  );
}
