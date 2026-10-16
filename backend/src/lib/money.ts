export type ItemInput = { name: string; quantity: number; unitPrice: number };

/** Rounds to tiyin (2 decimals) to avoid floating point drift such as 0.1 + 0.2. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function itemTotal(item: ItemInput): number {
  return round2(item.quantity * item.unitPrice);
}

export function orderTotal(items: ItemInput[]): number {
  return round2(items.reduce((sum, item) => sum + itemTotal(item), 0));
}

export type OpenDebt = { id: string; debt: number };

/**
 * Splits one payment across several debts, oldest first.
 * Returns the allocations and any amount that could not be applied.
 */
export function allocatePayment(debts: OpenDebt[], amount: number) {
  let left = round2(amount);
  const allocations: { id: string; amount: number }[] = [];
  for (const d of debts) {
    if (left <= 0) break;
    const take = round2(Math.min(d.debt, left));
    if (take <= 0) continue;
    allocations.push({ id: d.id, amount: take });
    left = round2(left - take);
  }
  return { allocations, rest: left };
}
