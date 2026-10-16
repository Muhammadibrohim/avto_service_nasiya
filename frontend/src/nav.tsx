import { createContext, useContext } from "react";
import type { Role, Session } from "./types";

export type Route =
  | { name: "dashboard" }
  | { name: "customers" }
  | { name: "customer"; id: string }
  | { name: "newOrder"; customerId?: string; vehicleId?: string }
  | { name: "order"; id: string }
  | { name: "payments" }
  | { name: "debts" }
  | { name: "history" }
  | { name: "reports" }
  | { name: "catalog" }
  | { name: "settings" }
  | { name: "more" };

export type AppCtx = {
  session: Session;
  setSession: (s: Session) => void;
  go: (r: Route) => void;
  back: () => void;
  isManager: boolean;
  role: Role;
};

export const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}
