import { useState } from "react";
import { api, useApi } from "../api";
import { useApp } from "../nav";
import { confirmDialog, haptic } from "../telegram";
import { money, som } from "../format";
import type { CatalogItem } from "../types";
import { Empty, MoneyInput, Msg, SectionTitle } from "../components/ui";

export function Catalog() {
  const { isManager } = useApp();
  const [tab, setTab] = useState<"services" | "parts">("services");
  const { data, reload } = useApi<CatalogItem[]>(`/${tab}`);
  const [edit, setEdit] = useState<CatalogItem | "new" | null>(null);

  return (
    <section>
      <SectionTitle title="Katalog" count={data?.length} />
      <p className="hint">Tez-tez bajariladigan ishlar va detallarni shu yerga kiriting — yangi servisda bir bosishda qo‘shiladi. Detal ishlatilganda ombordagi qoldiq avtomatik kamayadi.</p>
      <div className="tabs">
        <button className={tab === "services" ? "chosen" : ""} onClick={() => { setTab("services"); setEdit(null); }}>🔧 Xizmatlar</button>
        <button className={tab === "parts" ? "chosen" : ""} onClick={() => { setTab("parts"); setEdit(null); }}>⚙️ Detallar</button>
      </div>
      {isManager && edit === null && <button className="primary" onClick={() => setEdit("new")}>＋ {tab === "services" ? "XIZMAT" : "DETAL"} QO‘SHISH</button>}
      {edit && <CatalogForm key={edit === "new" ? "new" : edit.id} kind={tab} item={edit === "new" ? undefined : edit} onDone={() => { setEdit(null); reload(); }} />}
      <div className="list">
        {data?.map((i) => (
          <div key={i.id} className={`row ${isManager ? "clickable" : ""}`} onClick={() => isManager && setEdit(i)}>
            <div className="row-main"><b>{i.name}</b>{tab === "parts" && <small className={Number(i.stock) <= 0 ? "debt" : ""}>Omborda: {money(i.stock)} dona</small>}</div>
            <strong>{som(i.defaultPrice)}</strong>
          </div>
        ))}
        {data && !data.length && <Empty>Hali hech narsa qo‘shilmagan</Empty>}
      </div>
    </section>
  );
}

function CatalogForm({ kind, item, onDone }: { kind: "services" | "parts"; item?: CatalogItem; onDone: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(item ? String(Number(item.defaultPrice)) : "");
  const [stock, setStock] = useState(item?.stock !== undefined ? String(Number(item.stock)) : "0");
  const [msg, setMsg] = useState("");
  const save = async () => {
    const body = { name, defaultPrice: Number(price || 0), ...(kind === "parts" && { stock: Number(stock || 0) }) };
    try {
      await api(item ? `/${kind}/${item.id}` : `/${kind}`, { method: item ? "PATCH" : "POST", body });
      haptic("success"); onDone();
    } catch (e) { setMsg("❌ " + (e as Error).message); }
  };
  const remove = async () => {
    if (!item || !(await confirmDialog(`${item.name} katalogdan olib tashlansinmi?`))) return;
    await api(`/${kind}/${item.id}`, { method: "DELETE" }); onDone();
  };
  return (
    <section className="panel">
      <input placeholder="Nomi" value={name} onChange={(e) => setName(e.target.value)} />
      <MoneyInput placeholder="Narxi, so‘m" value={price} onChange={setPrice} />
      {kind === "parts" && <input placeholder="Ombordagi soni" inputMode="decimal" value={stock} onChange={(e) => setStock(e.target.value.replace(/[^\d.-]/g, ""))} />}
      <button className="primary" onClick={save}>SAQLASH</button>
      <div className="row-actions">
        <button className="link" onClick={onDone}>Bekor qilish</button>
        {item && <button className="link danger" onClick={remove}>O‘chirish</button>}
      </div>
      <Msg text={msg} />
    </section>
  );
}
