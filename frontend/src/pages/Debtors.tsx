import { useMemo, useState } from "react";
import { useApi } from "../api";
import { useApp } from "../nav";
import { daysUntil, dueLabel, phone, som } from "../format";
import { groupDebts } from "../debtors";
import type { Order } from "../types";
import { Card, Empty, ErrorBox, Loading, Row, SectionTitle } from "../components/ui";

export function Debtors() {
  const { go } = useApp();
  const { data, error, loading, reload } = useApi<Order[]>("/debts");
  const [filter, setFilter] = useState<"all" | "overdue" | "soon">("all");
  const groups = useMemo(() => groupDebts(data ?? []), [data]);
  const total = groups.reduce((s, g) => s + g.debt, 0);
  const overdue = groups.filter((g) => g.firstDue && daysUntil(g.firstDue) < 0);
  const overdueAmount = (data ?? []).filter((o) => o.dueDate && daysUntil(o.dueDate) < 0).reduce((s, o) => s + Number(o.debt), 0);
  const soon = groups.filter((g) => g.firstDue && daysUntil(g.firstDue) >= 0 && daysUntil(g.firstDue) <= 7);
  const shown = filter === "overdue" ? overdue : filter === "soon" ? soon : groups;

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;

  return (
    <section>
      <SectionTitle title="Qarzdorlar" count={groups.length} />
      <div className="grid">
        <Card n={som(total)} t="Umumiy qarz" tone={total ? "warn" : "ok"} />
        <Card n={som(overdueAmount)} t={`Muddati o‘tgan · ${overdue.length} mijoz`} tone={overdue.length ? "warn" : "ok"} />
      </div>
      <div className="tabs">
        <button className={filter === "all" ? "chosen" : ""} onClick={() => setFilter("all")}>Barchasi {groups.length}</button>
        <button className={filter === "overdue" ? "chosen" : ""} onClick={() => setFilter("overdue")}>Kechikkan {overdue.length}</button>
        <button className={filter === "soon" ? "chosen" : ""} onClick={() => setFilter("soon")}>7 kun ichida {soon.length}</button>
      </div>
      <div className="list">
        {shown.map((g) => (
          <Row key={g.customerId} onClick={() => go({ name: "customer", id: g.customerId })}
            title={g.name} sub={`${phone(g.phone)} · 🚗 ${g.plates.join(" · ")} · ${dueLabel(g.firstDue)}`}
            right={<span className="debt">{som(g.debt)}</span>} />
        ))}
        {!shown.length && <Empty>Qarzdor yo‘q 🎉</Empty>}
      </div>
    </section>
  );
}
