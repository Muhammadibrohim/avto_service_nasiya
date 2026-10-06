import { Router } from "express";
import { prisma } from "./db.js";
import { telegramAuth } from "./middleware/telegramAuth.js";
import { auth, AuthRequest } from "./middleware/auth.js";

export const router = Router();

router.post("/auth/telegram", telegramAuth, async (req, res) => {
  const tg = req.telegramUser!;
  const telegramId = String(tg.id);
  const name = [tg.first_name, tg.last_name].filter(Boolean).join(" ").trim() || tg.username || "Telegram user";

  const result = await prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { telegramId } });
    if (!user) {
      user = await tx.user.create({ data: { telegramId, name, username: tg.username, role: "owner", status: "active" } });
    } else {
      user = await tx.user.update({ where: { id: user.id }, data: { name, username: tg.username } });
    }

    let workshop = await tx.workshop.findFirst({ where: { ownerUserId: user.id } });
    if (!workshop) {
      workshop = await tx.workshop.create({ data: { name: "AVTO SERVICE NASIYA", ownerUserId: user.id, status: "active" } });
    }
    return { user, workshop };
  });

  res.json(result);
});

router.get("/me", auth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  const workshop = req.user!.workshopId ? await prisma.workshop.findUnique({ where: { id: req.user!.workshopId } }) : null;
  res.json({ user, workshop });
});

router.get("/customers", auth, async (req: AuthRequest, res) => {
  if (!req.user?.workshopId) return res.json([]);
  const q = String(req.query.q || "").trim();
  const customers = await prisma.customer.findMany({
    where: { workshopId: req.user.workshopId, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}) },
    include: { vehicles: true },
    orderBy: { createdAt: "desc" }
  });
  res.json(customers);
});

router.get("/orders", auth, async (req: AuthRequest, res) => {
  if (!req.user?.workshopId) return res.json([]);
  res.json(await prisma.serviceOrder.findMany({
    where: { workshopId: req.user.workshopId },
    include: { customer: true, vehicle: true, items: true, payments: true },
    orderBy: { createdAt: "desc" }
  }));
});

router.get("/debts", auth, async (req: AuthRequest, res) => {
  if (!req.user?.workshopId) return res.json([]);
  res.json(await prisma.serviceOrder.findMany({
    where: { workshopId: req.user.workshopId, debt: { gt: 0 } },
    include: { customer: true, vehicle: true },
    orderBy: [{ dueDate: "asc" }, { debt: "desc" }]
  }));
});

router.get("/analytics", auth, async (req: AuthRequest, res) => {
  if (!req.user?.workshopId) return res.json({ orders: 0, revenue: 0, paid: 0, debt: 0 });
  const [orders, aggregate] = await Promise.all([
    prisma.serviceOrder.count({ where: { workshopId: req.user.workshopId } }),
    prisma.serviceOrder.aggregate({ where: { workshopId: req.user.workshopId }, _sum: { total: true, paid: true, debt: true } })
  ]);
  res.json({ orders, revenue: aggregate._sum.total || 0, paid: aggregate._sum.paid || 0, debt: aggregate._sum.debt || 0 });
});

router.post("/payments", auth, async (req: AuthRequest, res) => {
  const { orderId, amount, method = "cash", note } = req.body;
  const value = Number(amount);
  if (!orderId || !Number.isFinite(value) || value <= 0) return res.status(400).json({ error: "Invalid payment" });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.findFirst({ where: { id: orderId, workshopId: req.user!.workshopId } });
      if (!order) throw new Error("Order not found");
      if (value > Number(order.debt)) throw new Error("Payment exceeds remaining debt");
      const payment = await tx.payment.create({ data: { orderId, customerId: order.customerId, amount: value, method, note } });
      const paid = Number(order.paid) + value;
      const debt = Math.max(0, Number(order.total) - paid);
      const updated = await tx.serviceOrder.update({ where: { id: orderId }, data: { paid, debt, status: debt === 0 ? "completed" : order.status } });
      return { payment, order: updated };
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Payment failed" });
  }
});
