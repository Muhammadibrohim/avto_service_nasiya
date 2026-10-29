import { test } from "node:test";
import assert from "node:assert/strict";
import { buildItems, buildMoney, cleanPlate, PlanProblem } from "../src/bot/plan.js";
import { extractionSchema, type Extraction } from "../src/bot/extract.js";
import { readTranscript } from "../src/bot/stt.js";
import { RateLimiter } from "../src/lib/rateLimit.js";
import { dueDateInDays } from "../src/lib/time.js";
import { safeEqual } from "../src/telegram.js";

const base: Extraction = {
  isServiceOrder: true, customerName: "Malik aka", phone: null, plate: "01 a 123 bc", carMake: "Nexia", carModel: null,
  items: [], paid: null, paidAll: false, paymentMethod: null, dueDays: null, mileage: null, note: null,
};
const catalog = [
  { id: "s1", name: "Moy almashtirish", price: 200000, kind: "service" as const },
  { id: "p1", name: "Moy filtri", price: 45000, kind: "part" as const },
];

test("catalog price fills a price that was not spoken", () => {
  const items = buildItems([{ name: "moy almashtirish", quantity: null, unitPrice: null, catalogId: null }, { name: "Filtr", quantity: 2, unitPrice: 50000, catalogId: "p1" }], catalog);
  assert.deepEqual(items[0], { name: "Moy almashtirish", quantity: 1, unitPrice: 200000, serviceId: "s1", partId: null });
  assert.deepEqual(items[1], { name: "Moy filtri", quantity: 2, unitPrice: 50000, serviceId: null, partId: "p1" });
});

test("an item without any price is refused, not guessed", () => {
  assert.throws(() => buildItems([{ name: "Razval", quantity: 1, unitPrice: null, catalogId: null }], catalog), PlanProblem);
});

test("debt without a spoken due date gets 7 days", () => {
  const items = buildItems([{ name: "Ish", quantity: 1, unitPrice: 250000, catalogId: null }], []);
  const now = new Date("2026-10-29T10:00:00Z");
  const m = buildMoney({ ...base, paid: 100000 }, items, now);
  assert.equal(m.debt, 150000);
  assert.equal(m.dueDate, "2026-11-05");
  assert.equal(m.dueIsDefault, true);
  assert.equal(buildMoney({ ...base, paid: 100000, dueDays: 10 }, items, now).dueDate, "2026-11-08");
  const full = buildMoney({ ...base, paidAll: true }, items, now);
  assert.equal(full.debt, 0);
  assert.equal(full.dueDate, null);
  assert.equal(buildMoney({ ...base, paid: 999999 }, items, now).paid, 250000, "payment is capped at the total");
});

test("plates are normalized", () => {
  assert.equal(cleanPlate("01 a 123-bc"), "01A123BC");
  assert.equal(cleanPlate("ab"), null);
});

test("model output is validated", () => {
  assert.throws(() => extractionSchema.parse({ ...base, items: [{ name: "x", quantity: -1, unitPrice: 5, catalogId: null }] }));
  assert.throws(() => extractionSchema.parse({ ...base, paid: -100 }));
});

test("transcript is read from known response shapes", () => {
  assert.equal(readTranscript({ result: { text: " salom " } }), "salom");
  assert.equal(readTranscript({ text: "a" }), "a");
  assert.equal(readTranscript({ result: "b" }), "b");
  assert.equal(readTranscript({}), "");
});

test("rate limiter blocks after the limit", () => {
  const r = new RateLimiter(2, 1000);
  assert.ok(r.take("u", 0));
  assert.ok(r.take("u", 10));
  assert.ok(!r.take("u", 20));
  assert.ok(r.take("u", 1500), "window slides");
});

test("default due date is a local calendar day", () => {
  // 2026-10-29 21:00 UTC is already the 30th in Tashkent
  assert.equal(dueDateInDays(7, new Date("2026-10-29T21:00:00Z")).toISOString(), "2026-11-06T00:00:00.000Z");
});

test("secret comparison", () => {
  assert.ok(safeEqual("abc", "abc"));
  assert.ok(!safeEqual("abc", "abd"));
  assert.ok(!safeEqual("abc", "abcd"));
});
