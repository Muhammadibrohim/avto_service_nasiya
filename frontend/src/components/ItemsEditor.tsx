import { useState } from "react";
import { useApi } from "../api";
import { money, som } from "../format";
import type { CatalogItem } from "../types";
import { MoneyInput } from "./ui";

export type DraftItem = { name: string; quantity: number; unitPrice: number; serviceId?: string | null; partId?: string | null };

export const draftTotal = (items: DraftItem[]) => items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

/** Order line editor with one-tap picks from the service / part catalog. */
export function ItemsEditor({ items, onChange }: { items: DraftItem[]; onChange: (i: DraftItem[]) => void }) {
  const services = useApi<CatalogItem[]>("/services").data ?? [];
  const parts = useApi<CatalogItem[]>("/parts").data ?? [];
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  const add = (item: DraftItem) => onChange([...items, item]);
  const addCustom = () => {
    if (!name.trim() || price === "") return;
    add({ name: name.trim(), quantity: Number(qty) || 1, unitPrice: Number(price) });
    setName(""); setQty("1"); setPrice("");
  };
  const update = (i: number, patch: Partial<DraftItem>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <>
      {(services.length > 0 || parts.length > 0) && (
        <div className="chips">
          {services.map((s) => <button key={s.id} className="chip" onClick={() => add({ name: s.name, quantity: 1, unitPrice: Number(s.defaultPrice), serviceId: s.id })}>🔧 {s.name}</button>)}
          {parts.map((p) => <button key={p.id} className="chip" onClick={() => add({ name: p.name, quantity: 1, unitPrice: Number(p.defaultPrice), partId: p.id })}>⚙️ {p.name}{Number(p.stock) <= 0 ? " (0)" : ""}</button>)}
        </div>
      )}
      <div className="addline">
        <input placeholder="Ish / detal nomi" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Soni" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))} />
        <MoneyInput placeholder="Narx" value={price} onChange={setPrice} />
        <button onClick={addCustom} aria-label="Qo‘shish">＋</button>
      </div>
      <div className="list">
        {items.map((x, i) => (
          <div className="row item-row" key={i}>
            <div className="row-main">
              <b>{x.partId ? "⚙️ " : x.serviceId ? "🔧 " : ""}{x.name}</b>
              <small>
                <button className="mini" onClick={() => update(i, { quantity: Math.max(1, x.quantity - 1) })}>−</button>
                {money(x.quantity)} × {money(x.unitPrice)}
                <button className="mini" onClick={() => update(i, { quantity: x.quantity + 1 })}>＋</button>
              </small>
            </div>
            <strong>{som(x.quantity * x.unitPrice)}</strong>
            <button className="remove" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="O‘chirish">✕</button>
          </div>
        ))}
      </div>
      {items.length > 0 && <div className="total-line"><span>Jami</span><strong>{som(draftTotal(items))}</strong></div>}
    </>
  );
}
