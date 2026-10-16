import { useState } from "react";
import { api, useApi } from "../api";
import { useApp } from "../nav";
import { confirmDialog, haptic } from "../telegram";
import type { Dashboard, Member, Role, Session, Settings as S } from "../types";
import { Disclosure, Field, Msg, Row, SectionTitle } from "../components/ui";

const ROLE: Record<Role, string> = { owner: "Ega", admin: "Admin", staff: "Usta / xodim" };

export function Settings() {
  const { session, setSession, isManager, role } = useApp();
  const w = session.workshop!;
  const [name, setName] = useState(w.name);
  const [phone, setPhone] = useState(w.phone ?? "");
  const [address, setAddress] = useState(w.address ?? "");
  const [settings, setSettings] = useState<S>(session.settings ?? { reminderEnabled: true, reminderDays: 3 });
  const [msg, setMsg] = useState("");

  const save = async () => {
    setMsg("");
    try {
      await api("/workshop", { method: "PATCH", body: { name, phone, address, settings } });
      setSession(await api<Session>("/me"));
      haptic("success"); setMsg("✅ Saqlandi");
    } catch (e) { haptic("error"); setMsg("❌ " + (e as Error).message); }
  };

  const testReminder = async () => {
    try {
      const r = await api<{ sent: number; orders: number }>("/reminders/test", { method: "POST" });
      setMsg(r.sent ? `✅ Eslatma Telegram’ga yuborildi (${r.orders} ta qarz)` : "❌ Xabar yuborilmadi. Botga /start yozganingizni tekshiring.");
    } catch (e) { setMsg("❌ " + (e as Error).message); }
  };

  return (
    <section>
      <SectionTitle title="Sozlamalar" />
      <div className="panel">
        <p>👤 {session.user.name}{session.user.username && ` (@${session.user.username})`}</p>
        <p>🔑 Rolingiz: <b>{ROLE[role]}</b></p>
      </div>

      {isManager ? (
        <>
          <SectionTitle title="Ustaxona" />
          <section className="panel">
            <Field label="Nomi"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Telefon"><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            <Field label="Manzil"><input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
          </section>

          <SectionTitle title="Nasiya eslatmalari" />
          <section className="panel">
            <label className="toggle">
              <input type="checkbox" checked={settings.reminderEnabled} onChange={(e) => setSettings({ ...settings, reminderEnabled: e.target.checked })} />
              <span>Har kuni ertalab Telegram’ga qarzlar ro‘yxatini yuborish</span>
            </label>
            <Field label="Muddatidan necha kun oldin eslatilsin" hint="0 — faqat muddati kelgan va o‘tganlar">
              <input type="number" min={0} max={30} value={settings.reminderDays} onChange={(e) => setSettings({ ...settings, reminderDays: Number(e.target.value) })} />
            </Field>
            <button className="secondary" onClick={testReminder}>🔔 Hozir sinab ko‘rish</button>
          </section>
          <button className="primary" onClick={save}>SAQLASH</button>
          <Msg text={msg} />
          <Members />
          {role === "owner" && <JoinOtherIfEmpty />}
        </>
      ) : (
        <div className="panel"><p>🏠 {w.name}</p><p>Ustaxona sozlamalarini faqat ega yoki admin o‘zgartira oladi.</p></div>
      )}
    </section>
  );
}

function Members() {
  const { session, setSession, role } = useApp();
  const { data, reload } = useApi<Member[]>("/members");
  const [msg, setMsg] = useState("");
  const code = session.workshop?.inviteCode;

  const regenerate = async () => {
    if (code && !(await confirmDialog("Yangi kod yaratilsa, eski kod ishlamay qoladi. Davom etasizmi?"))) return;
    await api("/workshop/invite", { method: "POST" });
    setSession(await api<Session>("/me"));
  };
  const copy = () => code && navigator.clipboard?.writeText(code).then(() => setMsg("✅ Kod nusxalandi"));
  const setRole = async (m: Member, r: Role) => {
    try { await api(`/members/${m.id}`, { method: "PATCH", body: { role: r } }); reload(); }
    catch (e) { setMsg("❌ " + (e as Error).message); }
  };
  const remove = async (m: Member) => {
    if (!(await confirmDialog(`${m.user.name ?? "Xodim"} ustaxonadan chiqarilsinmi?`))) return;
    try { await api(`/members/${m.id}`, { method: "DELETE" }); reload(); }
    catch (e) { setMsg("❌ " + (e as Error).message); }
  };

  return (
    <>
      <SectionTitle title="Xodimlar" count={data?.length} />
      <section className="panel">
        <p>Ustani qo‘shish uchun unga botni ochib, <b>“Kod bilan qo‘shilish”</b> bo‘limiga shu kodni kiritishini ayting:</p>
        {code ? (
          <div className="invite"><code>{code}</code><button className="chip" onClick={copy}>Nusxalash</button><button className="chip" onClick={regenerate}>↻ Yangilash</button></div>
        ) : (
          <button className="secondary" onClick={regenerate}>Taklif kodi yaratish</button>
        )}
      </section>
      <div className="list">
        {data?.map((m) => (
          <Row key={m.id}
            title={`${m.user.name ?? "Xodim"}${m.user.id === session.user.id ? " (siz)" : ""}`}
            sub={<>
              {ROLE[m.role]}{m.user.username && ` · @${m.user.username}`}
              {m.role !== "owner" && m.user.id !== session.user.id && (
                <span className="row-actions">
                  {role === "owner" && <button className="link" onClick={() => setRole(m, m.role === "admin" ? "staff" : "admin")}>{m.role === "admin" ? "Usta qilish" : "Admin qilish"}</button>}
                  {(role === "owner" || m.role === "staff") && <button className="link danger" onClick={() => remove(m)}>Chiqarish</button>}
                </span>
              )}
            </>} />
        ))}
      </div>
      <Msg text={msg} />
    </>
  );
}

/** Shown only while the owner's workshop has no data — otherwise the server refuses anyway. */
function JoinOtherIfEmpty() {
  const { data } = useApi<Dashboard>("/dashboard");
  if (!data || data.customers > 0 || data.orders > 0) return null;
  return <JoinOther />;
}

/**
 * The first app version created an empty workshop for everyone who opened the
 * bot, so a mechanic could end up as the "owner" of nothing. This lets them
 * join the real workshop; the server allows it only while theirs is empty.
 */
function JoinOther() {
  const { setSession } = useApp();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const join = async () => {
    if (!(await confirmDialog("Hozirgi bo‘sh ustaxonangiz o‘chiriladi va siz boshqa ustaxonaga xodim bo‘lib qo‘shilasiz. Davom etasizmi?"))) return;
    try {
      setSession(await api<Session>("/onboarding/join", { method: "POST", body: { code } }));
      haptic("success");
    } catch (e) { haptic("error"); setMsg("❌ " + (e as Error).message); }
  };
  return (
    <>
      <SectionTitle title="Boshqa ustaxonaga o‘tish" />
      <Disclosure label="🔑 TAKLIF KODI BILAN QO‘SHILISH" openLabel="✕ YOPISH">
        <p>Agar siz aslida boshqa ustaxonada ishlasangiz, egasidan taklif kodini olib shu yerga kiriting. Bu faqat sizning ustaxonangizda hali mijoz va servis bo‘lmasa ishlaydi.</p>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD2345" autoCapitalize="characters" />
        <button className="primary" onClick={join} disabled={code.trim().length < 4}>QO‘SHILISH</button>
        <Msg text={msg} />
      </Disclosure>
    </>
  );
}
