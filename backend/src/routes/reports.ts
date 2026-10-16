import { Router } from "express";
import { prisma } from "../db.js";
import { managers, ws, type AuthRequest } from "../middleware/auth.js";
import { badRequest } from "../lib/http.js";
import { round2 } from "../lib/money.js";
import { addDays, localDateKey, parseLocalDate, startOfLocalDay } from "../lib/time.js";
import { getSettings } from "../lib/workshop.js";

export const reportsRouter = Router();

const num = (v: unknown) => Number(v ?? 0);

reportsRouter.get("/dashboard", async (req: AuthRequest, res) => {
  const workshopId = ws(req);
  const today = startOfLocalDay();
  const monthStart = parseLocalDate(localDateKey(new Date()).slice(0, 8) + "01");
  const { reminderDays } = await getSettings(workshopId);
  const active = { workshopId, status: { not: "cancelled" as const } };
  const openDebt = { ...active, debt: { gt: 0 } };

  const [totals, customers, overdue, todayPaid, monthPaid, monthOrders, reminders, debtorCount] = await Promise.all([
    prisma.serviceOrder.aggregate({ where: active, _sum: { total: true, paid: true, debt: true }, _count: true }),
    prisma.customer.count({ where: { workshopId } }),
    prisma.serviceOrder.aggregate({ where: { ...openDebt, dueDate: { lt: today } }, _sum: { debt: true }, _count: true }),
    prisma.payment.aggregate({ where: { order: { workshopId }, createdAt: { gte: today } }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { order: { workshopId }, createdAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.serviceOrder.aggregate({ where: { ...active, createdAt: { gte: monthStart } }, _sum: { total: true }, _count: true }),
    prisma.serviceOrder.findMany({
      where: { ...openDebt, dueDate: { lt: addDays(today, reminderDays + 1) } },
      include: { customer: true, vehicle: true },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    prisma.serviceOrder.groupBy({ by: ["customerId"], where: openDebt }),
  ]);

  res.json({
    orders: totals._count,
    revenue: num(totals._sum.total),
    paid: num(totals._sum.paid),
    debt: num(totals._sum.debt),
    customers,
    debtors: debtorCount.length,
    overdueCount: overdue._count,
    overdueAmount: num(overdue._sum.debt),
    todayPaid: num(todayPaid._sum.amount),
    monthPaid: num(monthPaid._sum.amount),
    monthRevenue: num(monthOrders._sum.total),
    monthOrders: monthOrders._count,
    reminderDays,
    reminders,
  });
});

// Kept for the first frontend version.
reportsRouter.get("/analytics", async (req: AuthRequest, res) => {
  const workshopId = ws(req);
  const [a, customers, vehicles] = await Promise.all([
    prisma.serviceOrder.aggregate({ where: { workshopId, status: { not: "cancelled" } }, _sum: { total: true, paid: true, debt: true }, _count: true }),
    prisma.customer.count({ where: { workshopId } }),
    prisma.vehicle.count({ where: { workshopId } }),
  ]);
  res.json({ orders: a._count, revenue: num(a._sum.total), paid: num(a._sum.paid), debt: num(a._sum.debt), customers, vehicles });
});

/** Debts grouped by customer, most urgent first. */
reportsRouter.get("/debts", async (req: AuthRequest, res) => {
  const orders = await prisma.serviceOrder.findMany({
    where: { workshopId: ws(req), status: { not: "cancelled" }, debt: { gt: 0 } },
    include: { customer: true, vehicle: true },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  res.json(orders);
});

reportsRouter.get("/reports", managers, async (req: AuthRequest, res) => {
  const workshopId = ws(req);
  const todayKey = localDateKey(new Date());
  const fromKey = String(req.query.from || todayKey.slice(0, 8) + "01");
  const toKey = String(req.query.to || todayKey);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromKey) || !/^\d{4}-\d{2}-\d{2}$/.test(toKey)) throw badRequest("Sana formati YYYY-MM-DD bo‘lsin");
  const from = parseLocalDate(fromKey);
  const to = addDays(parseLocalDate(toKey), 1);
  if (to <= from) throw badRequest("Sana oralig‘i noto‘g‘ri");
  if (to.getTime() - from.getTime() > 400 * 86400000) throw badRequest("Oraliq 1 yildan oshmasin");

  const [orders, payments, debtRows] = await Promise.all([
    prisma.serviceOrder.findMany({
      where: { workshopId, status: { not: "cancelled" }, createdAt: { gte: from, lt: to } },
      select: { total: true, debt: true, createdAt: true, items: { select: { name: true, total: true, quantity: true } } },
    }),
    prisma.payment.findMany({ where: { order: { workshopId }, createdAt: { gte: from, lt: to } }, select: { amount: true, method: true, createdAt: true } }),
    prisma.serviceOrder.groupBy({
      by: ["customerId"],
      where: { workshopId, status: { not: "cancelled" }, debt: { gt: 0 } },
      _sum: { debt: true },
      orderBy: { _sum: { debt: "desc" } },
      take: 10,
    }),
  ]);

  const days = new Map<string, { date: string; revenue: number; collected: number; orders: number }>();
  for (let d = from; d < to; d = addDays(d, 1)) {
    const key = localDateKey(d);
    days.set(key, { date: key, revenue: 0, collected: 0, orders: 0 });
  }
  const byMethod: Record<string, number> = { cash: 0, card: 0, transfer: 0, other: 0 };
  const items = new Map<string, { name: string; count: number; total: number }>();
  let revenue = 0, newDebt = 0, collected = 0;

  for (const o of orders) {
    revenue += num(o.total);
    newDebt += num(o.debt);
    const day = days.get(localDateKey(o.createdAt));
    if (day) { day.revenue += num(o.total); day.orders += 1; }
    for (const i of o.items) {
      const key = i.name.trim().toLowerCase();
      const row = items.get(key) ?? { name: i.name.trim(), count: 0, total: 0 };
      row.count += num(i.quantity);
      row.total += num(i.total);
      items.set(key, row);
    }
  }
  for (const p of payments) {
    collected += num(p.amount);
    byMethod[p.method] = round2((byMethod[p.method] ?? 0) + num(p.amount));
    const day = days.get(localDateKey(p.createdAt));
    if (day) day.collected += num(p.amount);
  }

  const customers = await prisma.customer.findMany({ where: { id: { in: debtRows.map((r) => r.customerId) } } });
  const names = new Map(customers.map((c) => [c.id, c]));

  res.json({
    from: fromKey,
    to: toKey,
    orders: orders.length,
    revenue: round2(revenue),
    collected: round2(collected),
    newDebt: round2(newDebt),
    averageCheck: orders.length ? round2(revenue / orders.length) : 0,
    byMethod,
    daily: [...days.values()].map((d) => ({ ...d, revenue: round2(d.revenue), collected: round2(d.collected) })),
    topItems: [...items.values()].sort((a, b) => b.total - a.total).slice(0, 10).map((i) => ({ ...i, total: round2(i.total) })),
    topDebtors: debtRows.map((r) => ({ customerId: r.customerId, name: names.get(r.customerId)?.name ?? "—", phone: names.get(r.customerId)?.phone ?? null, debt: num(r._sum.debt) })),
  });
});
