import { useState, type ReactNode } from "react";
import { METHODS } from "../format";
import type { Method } from "../types";

export function Card(p: { n: ReactNode; t: string; tone?: "warn" | "ok" }) {
  return <div className={`card ${p.tone ?? ""}`}><strong>{p.n}</strong><span>{p.t}</span></div>;
}

export function SectionTitle(p: { title: string; count?: ReactNode; action?: ReactNode }) {
  return (
    <div className="sectionHead">
      <h2>{p.title}</h2>
      <div className="sectionHead-right">{p.count !== undefined && <b>{p.count}</b>}{p.action}</div>
    </div>
  );
}

export function Empty(p: { children: ReactNode }) {
  return <div className="empty">{p.children}</div>;
}

export function Loading() {
  return <div className="loading"><span /><span /><span /></div>;
}

export function ErrorBox(p: { message: string; onRetry?: () => void }) {
  return (
    <div className="error">
      {p.message}
      {p.onRetry && <button className="link" onClick={p.onRetry}>Qayta urinish</button>}
    </div>
  );
}

/** Success / error line under a form. Messages starting with ✅ are green. */
export function Msg(p: { text: string }) {
  if (!p.text) return null;
  return <p className={p.text.startsWith("✅") ? "msg ok" : "msg bad"}>{p.text}</p>;
}

export function Field(p: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{p.label}</span>
      {p.children}
      {p.hint && <small>{p.hint}</small>}
    </label>
  );
}

export function MethodPicker(p: { value: Method; onChange: (m: Method) => void }) {
  return (
    <div className="method">
      {METHODS.map((m) => (
        <button type="button" key={m.id} className={p.value === m.id ? "chosen" : ""} onClick={() => p.onChange(m.id)}>
          <span aria-hidden="true">{m.icon}</span>{m.label}
        </button>
      ))}
    </div>
  );
}

/** Number input that shows thousands separators while typing ("1 200 000"). */
export function MoneyInput(p: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }) {
  const shown = p.value ? Number(p.value).toLocaleString("ru-RU").replace(/ /g, " ") : "";
  return (
    <input
      inputMode="decimal"
      className={p.className}
      autoFocus={p.autoFocus}
      placeholder={p.placeholder}
      value={p.value.endsWith(".") ? shown + "." : shown}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.,]/g, "").replace(",", ".");
        if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) p.onChange(raw);
      }}
    />
  );
}

/** Collapsible panel used for inline forms. */
export function Disclosure(p: { label: string; openLabel?: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(p.defaultOpen));
  return (
    <>
      <button className={open ? "secondary" : "primary"} onClick={() => setOpen(!open)}>{open ? p.openLabel ?? "✕ YOPISH" : p.label}</button>
      {open && <section className="panel">{p.children}</section>}
    </>
  );
}

export function Row(p: { title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <div className={`row ${p.onClick ? "clickable" : ""} ${p.className ?? ""}`} onClick={p.onClick}>
      <div className="row-main"><b>{p.title}</b>{p.sub && <small>{p.sub}</small>}</div>
      {p.right !== undefined && <strong className="row-right">{p.right}</strong>}
    </div>
  );
}
