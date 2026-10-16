import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../nav";
import { useDebounced } from "../hooks";
import { date, som, STATUS } from "../format";
import type { Order, Page } from "../types";
import { Empty, ErrorBox, Loading, Row, SectionTitle } from "../components/ui";

const FILTERS = [
  { id: "", label: "Barchasi" },
  { id: "debt", label: "Qarzli" },
  { id: "overdue", label: "Kechikkan" },
  { id: "completed", label: "Yopilgan" },
  { id: "cancelled", label: "Bekor" },
];

export function History() {
  const { go } = useApp();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim());
  const [items, setItems] = useState<Order[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (reset: boolean) => {
    setLoading(true); setError("");
    const params = new URLSearchParams({ take: "30" });
    if (status) params.set("status", status);
    if (query) params.set("q", query);
    if (!reset && cursor) params.set("cursor", cursor);
    try {
      const page = await api<Page<Order>>(`/orders?${params}`);
      setItems((prev) => (reset ? page.items : [...prev, ...page.items]));
      setCursor(page.nextCursor);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(true); }, [status, query]);

  return (
    <section>
      <SectionTitle title="Servis tarixi" count={items.length + (cursor ? "+" : "")} />
      <input className="search" placeholder="🔎 Mijoz, raqam yoki ish nomi" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="tabs scroll">
        {FILTERS.map((f) => <button key={f.id} className={status === f.id ? "chosen" : ""} onClick={() => setStatus(f.id)}>{f.label}</button>)}
      </div>
      {error && <ErrorBox message={error} onRetry={() => load(true)} />}
      <div className="list">
        {items.map((o) => (
          <Row key={o.id} onClick={() => go({ name: "order", id: o.id })} className={o.status === "cancelled" ? "cancelled" : ""}
            title={`${o.customer?.name} · ${o.vehicle?.plate}`}
            sub={`${date(o.createdAt)} · ${STATUS[o.status]} · ${o.items?.map((i) => i.name).join(", ") || "—"}`}
            right={Number(o.debt) > 0 ? <span className="debt">{som(o.debt)}</span> : som(o.total)} />
        ))}
        {!loading && !items.length && <Empty>Servis topilmadi</Empty>}
      </div>
      {loading && <Loading />}
      {cursor && !loading && <button className="secondary" onClick={() => load(false)}>Yana yuklash</button>}
    </section>
  );
}
