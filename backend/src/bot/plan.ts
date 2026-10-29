import { orderTotal, round2 } from "../lib/money.js";
import { normalizePhone, normalizePlate } from "../lib/normalize.js";
import { addDays, DEFAULT_DUE_DAYS, localDateKey } from "../lib/time.js";
import type { CatalogEntry, Extraction } from "./extract.js";

export type PlanItem = { name: string; quantity: number; unitPrice: number; serviceId: string | null; partId: string | null };

export type Plan = {
  customer: { id: string; name: string; phone: string | null } | { id?: undefined; name: string; phone: string | null };
  vehicle: { id: string; make: string; model: string | null; plate: string } | { id?: undefined; make: string; model: string | null; plate: string };
  items: PlanItem[];
  total: number;
  paid: number;
  paymentMethod: "cash" | "card" | "transfer";
  debt: number;
  dueDate: string | null; // YYYY-MM-DD
  dueIsDefault: boolean;
  mileage: number | null;
  note: string | null;
};

/** Thrown when the message lacks something the order needs; the text is shown to the user. */
export class PlanProblem extends Error {}

/** Fills catalog links and prices. Pure, so it is unit-tested. */
export function buildItems(items: Extraction["items"], catalog: CatalogEntry[]): PlanItem[] {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const byName = new Map(catalog.map((c) => [c.name.trim().toLowerCase(), c]));
  const missing: string[] = [];
  const out = items.map((i) => {
    const c = (i.catalogId && byId.get(i.catalogId)) || byName.get(i.name.trim().toLowerCase());
    const unitPrice = i.unitPrice ?? c?.price ?? null;
    if (unitPrice == null) missing.push(i.name);
    return {
      name: c?.name ?? i.name.trim(),
      quantity: i.quantity ?? 1,
      unitPrice: round2(unitPrice ?? 0),
      serviceId: c?.kind === "service" ? c.id : null,
      partId: c?.kind === "part" ? c.id : null,
    };
  });
  if (missing.length) throw new PlanProblem(`Narxi aytilmagan: ${missing.join(", ")}. Narxini ham aytib, qaytadan yuboring.`);
  return out;
}

/** Totals, first payment and due date. Pure. */
export function buildMoney(ex: Extraction, items: PlanItem[], now = new Date()) {
  const total = orderTotal(items);
  const paid = ex.paidAll ? total : round2(Math.min(ex.paid ?? 0, total));
  const debt = round2(total - paid);
  const dueIsDefault = debt > 0 && ex.dueDays == null;
  const dueDate = debt > 0 ? localDateKey(addDays(now, ex.dueDays ?? DEFAULT_DUE_DAYS)) : null;
  return { total, paid, debt, dueDate, dueIsDefault, paymentMethod: ex.paymentMethod ?? "cash" };
}

export function cleanPlate(value: string | null): string | null {
  const p = normalizePlate(value ?? "");
  return p.length >= 4 ? p : null;
}

export function cleanPhone(value: string | null): string | null {
  const p = normalizePhone(value);
  return p && p.length >= 9 ? p : null;
}
