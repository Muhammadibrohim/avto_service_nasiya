import { useApi } from "../api";
import { useApp } from "../nav";
import { dueLabel, som } from "../format";
import type { Dashboard as D } from "../types";
import { Card, ErrorBox, Loading, Row, SectionTitle } from "../components/ui";

export function Dashboard() {
  const { go, session, isManager } = useApp();
  const { data: a, error, loading, reload } = useApi<D>("/dashboard");
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !a) return <Loading />;
  if (!a) return null;
  const closed = a.revenue ? Math.round((a.paid / a.revenue) * 100) : 0;

  return (
    <>
      <section className="hero">
        <span>{session.workshop?.name?.toUpperCase()}</span>
        <strong>Bugun: {som(a.todayPaid)}</strong>
        <p>Shu oy: {a.monthOrders} ta servis · {som(a.monthRevenue)} aylanma · {som(a.monthPaid)} tushum</p>
      </section>

      {a.reminders.length > 0 && (
        <section className="panel reminder-panel">
          <SectionTitle title="🔔 To‘lov muddati eslatmalari" count={a.reminders.length} />
          <p>Muddati o‘tgan yoki {a.reminderDays} kun ichida keladigan qarzlar.</p>
          {a.reminders.slice(0, 5).map((o) => (
            <Row key={o.id} className="reminder-row" onClick={() => go({ name: "customer", id: o.customerId })}
              title={o.customer?.name ?? "Mijoz"} sub={`${dueLabel(o.dueDate)} · 🚗 ${o.vehicle?.plate ?? "—"}`} right={som(o.debt)} />
          ))}
          {a.reminders.length > 5 && <button className="link" onClick={() => go({ name: "debts" })}>Barcha eslatmalarni ko‘rish →</button>}
        </section>
      )}

      <section className="grid">
        <Card n={som(a.debt)} t={`Umumiy qarz · ${a.debtors} mijoz`} tone={a.debt > 0 ? "warn" : undefined} />
        <Card n={som(a.overdueAmount)} t={`Muddati o‘tgan · ${a.overdueCount} ta`} tone={a.overdueCount ? "warn" : "ok"} />
        <Card n={som(a.revenue)} t={`Jami aylanma · ${a.orders} servis`} />
        <Card n={`${closed}%`} t="Yig‘ilgan ulush" />
      </section>

      <button className="primary" onClick={() => go({ name: "newOrder" })}>＋ YANGI SERVIS</button>
      <div className="quick">
        <button onClick={() => go({ name: "debts" })}>🔴 Qarzdorlar <b>{a.debtors}</b></button>
        <button onClick={() => go({ name: "payments" })}>💳 To‘lov qabul qilish</button>
        <button onClick={() => go({ name: "history" })}>🧾 Servis tarixi</button>
        {isManager ? <button onClick={() => go({ name: "reports" })}>📊 Hisobotlar</button> : <button onClick={() => go({ name: "customers" })}>👥 Mijozlar <b>{a.customers}</b></button>}
      </div>
    </>
  );
}
