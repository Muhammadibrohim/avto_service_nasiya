import { useState } from "react";
import { api } from "../api";
import { haptic } from "../telegram";
import type { Customer } from "../types";
import { Field, Msg } from "./ui";

/** Creates a customer together with their first vehicle. */
export function CustomerForm({ onCreated, submitLabel = "SAQLASH" }: { onCreated: (c: Customer) => void; submitLabel?: string }) {
  const [f, setF] = useState({ name: "", phone: "", make: "", model: "", plate: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.name.trim()) return setMsg("Ism kiriting");
    if (f.phone.replace(/\D/g, "").length < 9) return setMsg("Telefon raqamini to‘liq kiriting");
    if (!f.make.trim() || !f.plate.trim()) return setMsg("Mashina markasi va davlat raqamini kiriting");
    setBusy(true); setMsg("");
    try {
      const c = await api<Customer>("/customers", {
        method: "POST",
        body: { name: f.name, phone: f.phone, vehicle: { make: f.make, model: f.model, plate: f.plate } },
      });
      haptic("success");
      setF({ name: "", phone: "", make: "", model: "", plate: "" });
      onCreated(c);
    } catch (e) {
      haptic("error");
      setMsg("❌ " + (e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <>
      <h3>👤 Yangi mijoz</h3>
      <input placeholder="Ism familiya" value={f.name} onChange={set("name")} />
      <input placeholder="+998 telefon raqami" inputMode="tel" value={f.phone} onChange={set("phone")} />
      <div className="two">
        <input placeholder="Marka (Cobalt...)" value={f.make} onChange={set("make")} />
        <input placeholder="Model (ixtiyoriy)" value={f.model} onChange={set("model")} />
      </div>
      <Field label="Davlat raqami"><input placeholder="01A123BC" value={f.plate} autoCapitalize="characters" onChange={(e) => setF({ ...f, plate: e.target.value.toUpperCase() })} /></Field>
      <button className="primary" disabled={busy} onClick={save}>{busy ? "Saqlanmoqda..." : submitLabel}</button>
      <Msg text={msg} />
    </>
  );
}
