import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { managers, ws, type AuthRequest } from "../middleware/auth.js";
import { badRequest, conflict, notFound } from "../lib/http.js";
import { allocatePayment, round2 } from "../lib/money.js";
import { cleanText } from "../lib/normalize.js";
import { addDays, parseLocalDate } from "../lib/time.js";
import { orderInclude, statusFor } from "./orders.js";

export const paymentsRouter = Router();
type Tx = Prisma.TransactionClient;

const methodSchema = z.enum(["cash", "card", "transfer", "other"], "To‘lov turi noto‘g‘ri");
const amountSchema = z.coerce.number({ error: "Summani kiriting" }).positive("Summa 0 dan katta bo‘lsin").max(1e12);

/** Atomically applies `amount` to one order. Concurrent requests can never overpay. */
async function applyPayment(tx: Tx, p: { workshopId: string; orderId: string; amount: number; method: string; note: string | null; userId: string }) {
  const changed = await tx.serviceOrder.updateMany({
    where: { id: p.orderId, workshopId: p.workshopId, status: { not: "cancelled" }, debt: { gte: p.amount } },
    data: { paid: { increment: p.amount }, debt: { decrement: p.amount }, remindedAt: null },
  });
  if (changed.count !== 1) throw conflict("Servis topilmadi yoki summa qolgan qarzdan katta");
  const order = await tx.serviceOrder.findUniqueOrThrow({ where: { id: p.orderId } });
  const payment = await tx.payment.create({
    data: { orderId: order.id, customerId: order.customerId, amount: p.amount, method: p.method as never, note: p.note, createdById: p.userId },
  });
  const status = statusFor(Number(order.debt), order.status);
  if (status !== order.status) await tx.serviceOrder.update({ where: { id: order.id }, data: { status } });
  return payment;
}

const paySchema = z.object({
  orderId: z.string().min(1, "Servisni tanlang"),
  amount: amountSchema,
  method: methodSchema.default("cash"),
  note: z.string().max(300).optional().nullable(),
});

paymentsRouter.post("/payments", async (req: AuthRequest, res) => {
  const body = paySchema.parse(req.body);
  const result = await prisma.$transaction(async (tx) => {
    const payment = await applyPayment(tx, {
      workshopId: ws(req), orderId: body.orderId, amount: round2(body.amount), method: body.method, note: cleanText(body.note), userId: req.user!.id,
    });
    const order = await tx.serviceOrder.findUniqueOrThrow({ where: { id: body.orderId }, include: orderInclude });
    return { payment, order };
  });
  res.status(201).json(result);
});

const customerPaySchema = z.object({
  amount: amountSchema,
  method: methodSchema.default("cash"),
  note: z.string().max(300).optional().nullable(),
});

/** Pays a customer's debt across their orders, oldest due first. */
paymentsRouter.post("/customers/:id/pay", async (req: AuthRequest, res) => {
  const body = customerPaySchema.parse(req.body);
  const amount = round2(body.amount);
  const result = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: String(req.params.id), workshopId: ws(req) } });
    if (!customer) throw notFound("Mijoz topilmadi");
    const open = await tx.serviceOrder.findMany({
      where: { customerId: customer.id, workshopId: ws(req), status: { not: "cancelled" }, debt: { gt: 0 } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    });
    const totalDebt = round2(open.reduce((s, o) => s + Number(o.debt), 0));
    if (!open.length) throw badRequest("Bu mijozda qarz yo‘q");
    if (amount > totalDebt) throw badRequest(`Summa umumiy qarzdan (${totalDebt}) katta`);
    const { allocations } = allocatePayment(open.map((o) => ({ id: o.id, debt: Number(o.debt) })), amount);
    const payments = [];
    for (const a of allocations) {
      payments.push(await applyPayment(tx, { workshopId: ws(req), orderId: a.id, amount: a.amount, method: body.method, note: cleanText(body.note), userId: req.user!.id }));
    }
    return { payments, remainingDebt: round2(totalDebt - amount) };
  });
  res.status(201).json(result);
});

paymentsRouter.get("/payments", async (req: AuthRequest, res) => {
  const where: Prisma.PaymentWhereInput = { order: { workshopId: ws(req) } };
  if (req.query.from || req.query.to) {
    where.createdAt = {
      ...(req.query.from && { gte: parseLocalDate(String(req.query.from)) }),
      ...(req.query.to && { lt: addDays(parseLocalDate(String(req.query.to)), 1) }),
    };
  }
  const payments = await prisma.payment.findMany({
    where,
    include: { customer: true, order: { include: { vehicle: true } }, createdBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(req.query.take) || 50, 200),
  });
  res.json(payments);
});

/** Removes a mistaken payment and returns the amount to the order's debt. */
paymentsRouter.delete("/payments/:id", managers, async (req: AuthRequest, res) => {
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { id: String(req.params.id), order: { workshopId: ws(req) } }, include: { order: true } });
    if (!payment) throw notFound("To‘lov topilmadi");
    if (payment.order.status === "cancelled") throw conflict("Bekor qilingan servis to‘lovini o‘chirib bo‘lmaydi");
    await tx.payment.delete({ where: { id: payment.id } });
    const order = await tx.serviceOrder.update({
      where: { id: payment.orderId },
      data: { paid: { decrement: payment.amount }, debt: { increment: payment.amount } },
    });
    const status = statusFor(Number(order.debt), order.status === "completed" ? "open" : order.status);
    await tx.serviceOrder.update({ where: { id: order.id }, data: { status } });
    return tx.serviceOrder.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });
  res.json(result);
});
