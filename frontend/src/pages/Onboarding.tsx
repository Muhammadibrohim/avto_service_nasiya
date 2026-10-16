import { useState } from "react";
import { api } from "../api";
import { haptic, tg } from "../telegram";
import type { Session } from "../types";
import { Field, Msg } from "../components/ui";

export function Onboarding({ onDone }: { onDone: (s: Session) => void }) {
  const startCode = tg?.initDataUnsafe?.start_param ?? "";
  const [mode, setMode] = useState<"create" | "join">(startCode ? "join" : "create");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [code, setCode] = useState(startCode);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async () => {
    setBusy(true); setMsg("");
    try {
      const s = mode === "create"
        ? await api<Session>("/onboarding/workshop", { method: "POST", body: { name, phone, address } })
        : await api<Session>("/onboarding/join", { method: "POST", body: { code } });
      haptic("success");
      onDone(s);
    } catch (e) {
      haptic("error");
      setMsg("❌ " + (e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <main className="onboarding">
      <section className="hero">
        <span>AVTO SERVICE NASIYA</span>
        <strong>Xush kelibsiz! 👋</strong>
        <p>Servis, mijoz va nasiya qarzlarini bir joyda yuriting. Boshlash uchun ustaxonangizni yarating yoki ishchi sifatida qo‘shiling.</p>
      </section>
      <div className="tabs">
        <button className={mode === "create" ? "chosen" : ""} onClick={() => setMode("create")}>🏁 Ustaxona yaratish</button>
        <button className={mode === "join" ? "chosen" : ""} onClick={() => setMode("join")}>🔑 Kod bilan qo‘shilish</button>
      </div>
      <section className="panel">
        {mode === "create" ? (
          <>
            <Field label="Ustaxona nomi"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan, Xasanboy Auto Service" /></Field>
            <Field label="Telefon (ixtiyoriy)"><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998" /></Field>
            <Field label="Manzil (ixtiyoriy)"><input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
          </>
        ) : (
          <Field label="Taklif kodi" hint="Kodni ustaxona egasidan oling: Sozlamalar → Xodimlar.">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD2345" autoCapitalize="characters" />
          </Field>
        )}
        <button className="primary" disabled={busy} onClick={submit}>{busy ? "Kuting..." : mode === "create" ? "BOSHLASH" : "QO‘SHILISH"}</button>
        <Msg text={msg} />
      </section>
    </main>
  );
}
