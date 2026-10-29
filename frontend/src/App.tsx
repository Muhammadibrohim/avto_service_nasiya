import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { initTelegram, tg } from "./telegram";
import { Ctx, type Route } from "./nav";
import type { Session } from "./types";
import { ErrorBox, Loading } from "./components/ui";
import { Onboarding } from "./pages/Onboarding";
import { Dashboard } from "./pages/Dashboard";
import { Customers } from "./pages/Customers";
import { CustomerProfile } from "./pages/CustomerProfile";
import { NewOrder } from "./pages/NewOrder";
import { OrderDetail } from "./pages/OrderDetail";
import { Payments } from "./pages/Payments";
import { Debtors } from "./pages/Debtors";
import { History } from "./pages/History";
import { Reports } from "./pages/Reports";
import { Catalog } from "./pages/Catalog";
import { Settings } from "./pages/Settings";
import { More } from "./pages/More";

const TABS: { icon: string; label: string; route: Route }[] = [
  { icon: "⌂", label: "Asosiy", route: { name: "dashboard" } },
  { icon: "👥", label: "Mijozlar", route: { name: "customers" } },
  { icon: "＋", label: "Servis", route: { name: "newOrder" } },
  { icon: "💳", label: "To‘lov", route: { name: "payments" } },
  { icon: "☰", label: "Ko‘proq", route: { name: "more" } },
];
const ROOTS = new Set(TABS.map((t) => t.route.name));

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  // the bot's "Ilovada ochish" button links to #order=<id>
  const [stack, setStack] = useState<Route[]>(() => {
    const id = /^#order=([a-z0-9]{10,40})$/.exec(window.location.hash)?.[1];
    if (id) history.replaceState(null, "", window.location.pathname + window.location.search);
    return id ? [{ name: "dashboard" }, { name: "order", id }] : [{ name: "dashboard" }];
  });
  const route = stack[stack.length - 1];

  const start = useCallback(() => {
    setError("");
    if (!tg?.initData) {
      setError("Ilovani Telegram ichidagi bot menyusidan oching.");
      return;
    }
    api<Session>("/auth/telegram", { method: "POST" }).then(setSession).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => { initTelegram(); start(); }, [start]);

  // Root tabs reset the stack; other pages are pushed so "back" works.
  const go = useCallback((r: Route) => {
    setStack((s) => (ROOTS.has(r.name) ? [r] : [...s, r]));
    window.scrollTo(0, 0);
  }, []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : [{ name: "dashboard" }])), []);

  // Telegram's native back button mirrors our stack.
  useEffect(() => {
    const b = tg?.BackButton;
    if (!b) return;
    if (stack.length > 1) { b.show(); b.onClick(back); } else b.hide();
    return () => b.offClick(back);
  }, [stack.length, back]);

  const ctx = useMemo(() => {
    if (!session?.role) return null;
    return { session, setSession, go, back, role: session.role, isManager: session.role === "owner" || session.role === "admin" };
  }, [session, go, back]);

  if (error) return <main className="center"><h1>AVTO SERVICE NASIYA</h1><ErrorBox message={error} onRetry={tg?.initData ? start : undefined} /></main>;
  if (!session) return <main className="center"><Loading /></main>;
  if (session.needsOnboarding || !ctx) return <Onboarding onDone={setSession} />;

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <header>
          <div><small>AVTO SERVICE NASIYA</small><h1>{session.workshop?.name}</h1></div>
          <button className="avatar" onClick={() => go({ name: "settings" })} aria-label="Sozlamalar">{(session.user.name || "A")[0]}</button>
        </header>
        <main key={JSON.stringify(route)}>
          <Page route={route} />
        </main>
        <nav>
          {TABS.map((t) => (
            <button key={t.route.name} className={`${stack[0].name === t.route.name ? "active" : ""} ${t.route.name === "newOrder" ? "nav-plus" : ""}`} onClick={() => go(t.route)}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
      </div>
    </Ctx.Provider>
  );
}

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case "dashboard": return <Dashboard />;
    case "customers": return <Customers />;
    case "customer": return <CustomerProfile id={route.id} />;
    case "newOrder": return <NewOrder customerId={route.customerId} vehicleId={route.vehicleId} />;
    case "order": return <OrderDetail id={route.id} />;
    case "payments": return <Payments />;
    case "debts": return <Debtors />;
    case "history": return <History />;
    case "reports": return <Reports />;
    case "catalog": return <Catalog />;
    case "settings": return <Settings />;
    case "more": return <More />;
  }
}
