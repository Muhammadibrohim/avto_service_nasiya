import { useApp } from "../nav";
import { SectionTitle } from "../components/ui";

export function More() {
  const { go, isManager } = useApp();
  return (
    <section>
      <SectionTitle title="Qo‘shimcha" />
      <div className="quick vertical">
        <button onClick={() => go({ name: "debts" })}>🔴 Qarzdorlar</button>
        <button onClick={() => go({ name: "history" })}>🧾 Servis tarixi</button>
        {isManager && <button onClick={() => go({ name: "reports" })}>📊 Hisobotlar</button>}
        <button onClick={() => go({ name: "catalog" })}>🗂 Xizmat va detallar katalogi</button>
        <button onClick={() => go({ name: "settings" })}>⚙️ Sozlamalar{isManager ? " va xodimlar" : ""}</button>
      </div>
    </section>
  );
}
