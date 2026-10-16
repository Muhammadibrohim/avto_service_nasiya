import { useMemo, useState } from "react";
import { useApi } from "../api";
import { useApp } from "../nav";
import { dateTime, dueLabel, isoDay, methodLabel, som } from "../format";
import { groupDebts } from "../debtors";
import type { Order, Payment } from "../types";
import { Empty, ErrorBox, Loading, Row, SectionTitle } from "../components/ui";
import { PayForm } from "../components/PayForm";

export function Payments() {
  const { go } = useApp();
  const debts = useApi<Order[]>("/debts");
  const today = isoDay(new Date());
  const todayPayments = useApi<Payment[]>(`/payments?from=${today}&to=${today}`);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState("");

  const groups = useMemo(() => groupDebts(debts.data ?? []), [debts.data]);
  const needle = q.trim().toLowerCase().replace(/\s/g, "");
  const filtered = groups.filter((g) => `${g.name} ${g.phone ?? ""} ${g.plates.join(" ")}`.toLowerCase().replace(/\s/g, "").includes(needle));
  const current = groups.find((g) => g.customerId === picked);
  const reloadAll = () => { debts.reload(); todayPayments.reload(); };
  const todaySum = (todayPayments.data ?? []).reduce((s, p) => s + Number(p.amount), 0);

  return (
    <section>
      <SectionTitle title="To‘lov qabul qilish" count={groups.length} />
      {debts.error && <ErrorBox message={debts.error} onRetry={debts.reload} />}
      {current ? (
        <>
          <div className="panel selected">
            <div><b>👤 {current.name}</b><small>{current.plates.join(" · ")} · qarz {som(current.debt)}</small></div>
            <button className="link" onClick={() => setPicked("")}>O‘zgartirish</button>
          </div>
          <PayForm key={current.customerId + current.debt} customerId={current.customerId} orders={current.orders} onPaid={reloadAll} />
          <button className="link" onClick={() => go({ name: "customer", id: current.customerId })}>Mijoz profilini ochish →</button>
        </>
      ) : (
        <>
          <input className="search" placeholder="🔎 Ism, telefon yoki mashina raqami" value={q} onChange={(e) => setQ(e.target.value)} />
          {debts.loading && !debts.data && <Loading />}
          <div className="list">
            {filtered.slice(0, 30).map((g) => (
              <Row key={g.customerId} onClick={() => setPicked(g.customerId)} title={g.name} sub={`🚗 ${g.plates.join(" · ")} · ${dueLabel(g.firstDue)}`} right={<span className="debt">{som(g.debt)}</span>} />
            ))}
            {debts.data && !filtered.length && <Empty>{groups.length ? "Mos qarzdor topilmadi" : "Qarzdor yo‘q 🎉"}</Empty>}
          </div>
        </>
      )}

      <SectionTitle title={`Bugungi tushum · ${som(todaySum)}`} count={todayPayments.data?.length ?? 0} />
      <div className="list">
        {todayPayments.data?.map((p) => (
          <Row key={p.id} onClick={() => go({ name: "order", id: p.orderId })} title={`💰 ${som(p.amount)} · ${p.customer?.name ?? ""}`}
            sub={`${dateTime(p.createdAt)} · ${p.order?.vehicle?.plate ?? ""}${p.createdBy?.name ? " · " + p.createdBy.name : ""}`}
            right={<span className="muted">{methodLabel(p.method)}</span>} />
        ))}
        {todayPayments.data && !todayPayments.data.length && <Empty>Bugun hali to‘lov yo‘q</Empty>}
      </div>
    </section>
  );
}
