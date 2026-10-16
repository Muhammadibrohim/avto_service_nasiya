import type { Order } from "./types";

export type DebtorGroup = { customerId: string; name: string; phone: string | null; debt: number; orders: Order[]; firstDue: string | null; plates: string[] };

/** Groups open debt orders by customer, most urgent first. */
export function groupDebts(orders: Order[]): DebtorGroup[] {
  const map = new Map<string, DebtorGroup>();
  for (const o of orders) {
    const g = map.get(o.customerId) ?? { customerId: o.customerId, name: o.customer?.name ?? "Mijoz", phone: o.customer?.phone ?? null, debt: 0, orders: [], firstDue: null, plates: [] };
    g.debt += Number(o.debt);
    g.orders.push(o);
    if (o.dueDate && (!g.firstDue || o.dueDate < g.firstDue)) g.firstDue = o.dueDate;
    if (o.vehicle?.plate && !g.plates.includes(o.vehicle.plate)) g.plates.push(o.vehicle.plate);
    map.set(o.customerId, g);
  }
  return [...map.values()].sort((a, b) => {
    if (a.firstDue && b.firstDue) return a.firstDue.localeCompare(b.firstDue);
    if (a.firstDue) return -1;
    if (b.firstDue) return 1;
    return b.debt - a.debt;
  });
}
