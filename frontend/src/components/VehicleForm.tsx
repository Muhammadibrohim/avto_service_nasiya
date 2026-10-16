import { useState } from "react";
import { api } from "../api";
import { haptic } from "../telegram";
import type { Vehicle } from "../types";
import { Msg } from "./ui";

export function VehicleForm(p: { customerId: string; vehicle?: Vehicle; onSaved: (v: Vehicle) => void }) {
  const v = p.vehicle;
  const [f, setF] = useState({
    make: v?.make ?? "", model: v?.model ?? "", plate: v?.plate ?? "",
    year: v?.year ? String(v.year) : "", color: v?.color ?? "", mileage: v?.mileage ? String(v.mileage) : "", vin: v?.vin ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.make.trim() || !f.plate.trim()) return setMsg("Marka va davlat raqamini kiriting");
    setBusy(true); setMsg("");
    const body = { ...f, year: f.year || null, mileage: f.mileage || null };
    try {
      const saved = v
        ? await api<Vehicle>(`/vehicles/${v.id}`, { method: "PATCH", body })
        : await api<Vehicle>("/vehicles", { method: "POST", body: { ...body, customerId: p.customerId } });
      haptic("success");
      p.onSaved(saved);
    } catch (e) {
      setMsg("❌ " + (e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="two">
        <input placeholder="Marka" value={f.make} onChange={set("make")} />
        <input placeholder="Model" value={f.model} onChange={set("model")} />
      </div>
      <input placeholder="Davlat raqami" value={f.plate} autoCapitalize="characters" onChange={(e) => setF({ ...f, plate: e.target.value.toUpperCase() })} />
      <div className="two">
        <input placeholder="Yil" inputMode="numeric" value={f.year} onChange={set("year")} />
        <input placeholder="Rang" value={f.color} onChange={set("color")} />
      </div>
      <div className="two">
        <input placeholder="Probeg, km" inputMode="numeric" value={f.mileage} onChange={set("mileage")} />
        <input placeholder="VIN" value={f.vin} onChange={set("vin")} />
      </div>
      <button className="primary" disabled={busy} onClick={save}>{busy ? "Saqlanmoqda..." : v ? "O‘ZGARISHNI SAQLASH" : "＋ AVTOMOBILNI SAQLASH"}</button>
      <Msg text={msg} />
    </>
  );
}
