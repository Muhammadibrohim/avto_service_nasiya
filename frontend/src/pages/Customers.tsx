import { useState } from "react";
import { useApi } from "../api";
import { useApp } from "../nav";
import { useDebounced } from "../hooks";
import { phone, som } from "../format";
import type { Customer } from "../types";
import { Disclosure, Empty, ErrorBox, Loading, Row, SectionTitle } from "../components/ui";
import { CustomerForm } from "../components/CustomerForm";

export function Customers() {
  const { go } = useApp();
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim());
  const { data, error, loading, reload } = useApi<Customer[]>(`/customers${query ? `?q=${encodeURIComponent(query)}` : ""}`);

  return (
    <section>
      <SectionTitle title="Mijozlar" count={data?.length ?? "…"} />
      <Disclosure label="＋ MIJOZ QO‘SHISH" openLabel="✕ BEKOR QILISH">
        <CustomerForm onCreated={(c) => go({ name: "customer", id: c.id })} />
      </Disclosure>
      <input className="search" placeholder="🔎 Ism, telefon yoki davlat raqami" value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      <div className="list">
        {data?.map((c) => (
          <Row key={c.id} onClick={() => go({ name: "customer", id: c.id })}
            title={c.name}
            sub={`${c.vehicles.map((v) => v.plate).join(" · ") || "Avtomobilsiz"} · ${phone(c.phone)}`}
            right={c.debt ? <span className="debt">{som(c.debt)}</span> : <span className="muted">✓</span>} />
        ))}
        {data && !data.length && <Empty>{query ? "Hech narsa topilmadi" : "Hali mijoz yo‘q"}</Empty>}
      </div>
    </section>
  );
}
