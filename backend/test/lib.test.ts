import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { allocatePayment, orderTotal, round2 } from "../src/lib/money.js";
import { normalizePhone, normalizePlate } from "../src/lib/normalize.js";
import { localDateKey, parseLocalDate, startOfLocalDay } from "../src/lib/time.js";
import { validateTelegramInitData } from "../src/telegram.js";

export function signInitData(botToken: string, user: object, authDate = Math.floor(Date.now() / 1000)) {
  const params = new URLSearchParams({ auth_date: String(authDate), user: JSON.stringify(user), query_id: "AAH" });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set("hash", crypto.createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}

test("order totals avoid float drift", () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(orderTotal([{ name: "a", quantity: 3, unitPrice: 0.1 }, { name: "b", quantity: 1, unitPrice: 150000 }]), 150000.3);
});

test("payment is allocated oldest first and never exceeds a debt", () => {
  const r = allocatePayment([{ id: "a", debt: 100 }, { id: "b", debt: 50 }, { id: "c", debt: 30 }], 120);
  assert.deepEqual(r.allocations, [{ id: "a", amount: 100 }, { id: "b", amount: 20 }]);
  assert.equal(r.rest, 0);
  assert.equal(allocatePayment([{ id: "a", debt: 10 }], 25).rest, 15);
});

test("phone and plate normalization", () => {
  assert.equal(normalizePhone("+998 (90) 123-45-67"), "998901234567");
  assert.equal(normalizePhone("90 123 45 67"), "998901234567");
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePlate("01 a 123-bc"), "01A123BC");
});

test("local day helpers use Tashkent time", () => {
  // 2026-10-16 20:30 UTC is already 2026-10-17 01:30 in Tashkent
  const d = new Date("2026-10-16T20:30:00Z");
  assert.equal(localDateKey(d), "2026-10-17");
  assert.equal(startOfLocalDay(d).toISOString(), "2026-10-16T19:00:00.000Z");
  assert.equal(parseLocalDate("2026-10-17").toISOString(), "2026-10-16T19:00:00.000Z");
});

test("telegram initData validation", () => {
  const token = "123:ABC";
  const data = signInitData(token, { id: 42, first_name: "Ali" });
  assert.equal(validateTelegramInitData(data, token).user.id, 42);
  assert.throws(() => validateTelegramInitData(data, "123:OTHER"), /signature invalid/);
  assert.throws(() => validateTelegramInitData(data.replace("Ali", "Vali"), token), /signature invalid/);
  const old = signInitData(token, { id: 1 }, Math.floor(Date.now() / 1000) - 3 * 86400);
  assert.throws(() => validateTelegramInitData(old, token), /expired/);
});
