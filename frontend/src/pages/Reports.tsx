import { useState } from "react";
import { useApi } from "../api";
import { useApp } from "../nav";
import { isoDay, METHODS, money, phone, som } from "../format";
import type { Report } from "../types";
import { Card, Empty, ErrorBox, Loading, Row, SectionTitle } from "../components/ui";

function presets() {
  const now = new Date();
  const d = (y: number, m: number, day: number) => isoDay(new Date(y, m, day));
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return [
    { id: "today", label: "Bugun", from: isoDay(now), to: isoDay(now) },
    { id: "week", label: "Hafta", from: isoDay(weekStart), to: isoDay(now) },
    { id: "month", label: "Shu oy", from: d(now.getFullYear(), now.getMonth(), 1), to: isoDay(now) },
    { id: "prev", label: "O‘tgan oy", from: d(now.getFullYear(), now.getMonth() - 1, 1), to: d(now.getFullYear(), now.getMonth(), 0) },
  ];
}

export function Reports() {
  const { go, isManager } = useApp();
  const list = presets();
  const [range, setRange] = useState({ from: list[2].from, to: list[2].to });
  const { data: r, error, loading, reload } = useApi<Report>(isManager ? `/reports?from=${range.from}&to=${range.to}` : null);

  if (!isManager) return <div className="error">Hisobotlar faqat ega va adminlar uchun.</div>;
  const max = Math.max(1, ...(r?.daily ?? []).map((d) => Math.max(d.revenue, d.collected)));
  const methodTotal = r ? Object.values(r.byMethod).reduce((s, v) => s + v, 0) : 0;

  return (
    <section>
      <SectionTitle title="Hisobotlar" />
      <div className="tabs scroll">
        {list.map((p) => (
          <button key={p.id} className={range.from === p.from && range.to === p.to ? "chosen" : ""} onClick={() => setRange({ from: p.from, to: p.to })}>{p.label}</button>
        ))}
      </div>
      <div className="two">
        <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} />
        <input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} />
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !r && <Loading />}
      {r && (
        <>
          <div className="grid">
            <Card n={som(r.revenue)} t={`Aylanma · ${r.orders} servis`} />
            <Card n={som(r.collected)} t="Tushum (to‘lovlar)" tone="ok" />
            <Card n={som(r.newDebt)} t="Shu davrdagi nasiya" tone={r.newDebt ? "warn" : undefined} />
            <Card n={som(r.averageCheck)} t="O‘rtacha chek" />
          </div>

          {r.daily.length > 1 && (
            <>
              <SectionTitle title="Kunlik dinamika" action={<span className="legend"><i className="lg-rev" />aylanma <i className="lg-col" />tushum</span>} />
              <div className="bars">
                {r.daily.map((d) => (
                  <div className="bar" key={d.date} title={`${d.date}: ${som(d.revenue)} / ${som(d.collected)}`}>
                    <div className="bar-pair">
                      <span className="rev" style={{ height: `${(d.revenue / max) * 100}%` }} />
                      <span className="col" style={{ height: `${(d.collected / max) * 100}%` }} />
                    </div>
                    {r.daily.length <= 16 && <small>{d.date.slice(8)}</small>}
                  </div>
                ))}
              </div>
            </>
          )}

          <SectionTitle title="To‘lov turlari" />
          <div className="panel">
            {METHODS.map((m) => {
              const v = r.byMethod[m.id] ?? 0;
              const pct = methodTotal ? Math.round((v / methodTotal) * 100) : 0;
              return (
                <div className="meter" key={m.id}>
                  <div><span>{m.label}</span><b>{som(v)} · {pct}%</b></div>
                  <div className="meter-track"><span style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>

          <SectionTitle title="Eng ko‘p tushum keltirgan ishlar" />
          <div className="list">
            {r.topItems.map((i) => <Row key={i.name} title={i.name} sub={`${money(i.count)} marta`} right={som(i.total)} />)}
            {!r.topItems.length && <Empty>Bu davrda servis yo‘q</Empty>}
          </div>

          <SectionTitle title="Eng katta qarzdorlar" />
          <div className="list">
            {r.topDebtors.map((d) => <Row key={d.customerId} onClick={() => go({ name: "customer", id: d.customerId })} title={d.name} sub={phone(d.phone)} right={<span className="debt">{som(d.debt)}</span>} />)}
            {!r.topDebtors.length && <Empty>Qarzdor yo‘q 🎉</Empty>}
          </div>
        </>
      )}
    </section>
  );
}
