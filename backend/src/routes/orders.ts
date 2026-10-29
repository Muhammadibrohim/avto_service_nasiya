import { Router } from "express";
import { z } from "zod";
import { Prisma, type OrderStatus } from "@prisma/client";
import { prisma } from "../db.js";
import { managers, ws, type AuthRequest } from "../middleware/auth.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/http.js";
import { itemTotal, orderTotal, round2 } from "../lib/money.js";
import { cleanText, normalizePlate } from "../lib/normalize.js";
import { addDays, startOfLocalDay, parseLocalDate, dueDateInDays, DEFAULT_DUE_DAYS } from "../lib/time.js";
import { audit } from "../lib/audit.js";

export const ordersRouter = Router();

type Tx = Prisma.TransactionClient;

export const itemSchema = z.object({
  name: z.string().trim().min(1, "Ish yoki detal nomini kiriting").max(120),
  quantity: z.coerce.number().positive("Miqdor 0 dan katta bo‘lsin").max(100000).default(1),
  unitPrice: z.coerce.number().min(0, "Narx manfiy bo‘lmasin").max(1e12),
  serviceId: z.string().optional().nullable(),
  partId: z.string().optional().nullable(),
});

const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, "Sana noto‘g‘ri")
  .optional()
  .nullable()
  .or(z.literal(""));

const methodSchema = z.enum(["cash", "card", "transfer", "other"], "To‘lov turi noto‘g‘ri");

export const createSchema = z.object({
  customerId: z.string().min(1, "Mijozni tanlang"),
  vehicleId: z.string().min(1, "Avtomobilni tanlang"),
  items: z.array(itemSchema).min(1, "Kamida bitta ish yoki detal kiriting").max(100),
  paid: z.coerce.number().min(0).default(0),
  paymentMethod: methodSchema.default("cash"),
  dueDate: dueDateSchema,
  note: z.string().max(1000).optional().nullable(),
  mileage: z.coerce.number().int().min(0).optional().nullable(),
});

export const orderInclude = {
  customer: true,
  vehicle: true,
  items: true,
  payments: { orderBy: { createdAt: "desc" as const } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.ServiceOrderInclude;

export function statusFor(debt: number, current?: OrderStatus): OrderStatus {
  if (current === "cancelled") return "cancelled";
  if (debt <= 0) return "completed";
  return current === "in_progress" ? "in_progress" : "open";
}

function toDate(value?: string | null) {
  return value ? new Date(value.slice(0, 10)) : null;
}

/** Validates catalog links and returns normalized items with totals. */
async function normalizeItems(tx: Tx, workshopId: string, items: z.infer<typeof itemSchema>[]) {
  const serviceIds = [...new Set(items.map((i) => i.serviceId).filter(Boolean) as string[])];
  const partIds = [...new Set(items.map((i) => i.partId).filter(Boolean) as string[])];
  const [services, parts] = await Promise.all([
    serviceIds.length ? tx.service.count({ where: { id: { in: serviceIds }, workshopId } }) : 0,
    partIds.length ? tx.part.count({ where: { id: { in: partIds }, workshopId } }) : 0,
  ]);
  if (services !== serviceIds.length || parts !== partIds.length) throw badRequest("Katalog elementi topilmadi");
  return items.map((i) => ({
    name: i.name,
    quantity: i.quantity,
    unitPrice: round2(i.unitPrice),
    total: itemTotal(i),
    serviceId: i.serviceId || null,
    partId: i.partId || null,
  }));
}

/** Moves part stock: sign -1 when parts are used, +1 when returned. */
async function adjustStock(tx: Tx, items: { partId: string | null; quantity: Prisma.Decimal | number }[], sign: 1 | -1) {
  for (const item of items) {
    if (!item.partId) continue;
    await tx.part.update({ where: { id: item.partId }, data: { stock: { increment: sign * Number(item.quantity) } } });
  }
}

ordersRouter.get("/orders", async (req: AuthRequest, res) => {
  const take = Math.min(Math.max(Number(req.query.take) || 30, 1), 100);
  const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
  const status = String(req.query.status || "");
  const q = String(req.query.q || "").trim();
  const where: Prisma.ServiceOrderWhereInput = { workshopId: ws(req) };

  if (["open", "in_progress", "completed", "cancelled"].includes(status)) where.status = status as OrderStatus;
  if (status === "debt") Object.assign(where, { status: { not: "cancelled" }, debt: { gt: 0 } });
  if (status === "overdue") Object.assign(where, { status: { not: "cancelled" }, debt: { gt: 0 }, dueDate: { lt: startOfLocalDay() } });
  if (req.query.customerId) where.customerId = String(req.query.customerId);
  if (req.query.from || req.query.to) {
    where.createdAt = {
      ...(req.query.from && { gte: parseLocalDate(String(req.query.from)) }),
      ...(req.query.to && { lt: addDays(parseLocalDate(String(req.query.to)), 1) }),
    };
  }
  if (q) {
    where.OR = [
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { vehicle: { plate: { contains: normalizePlate(q), mode: "insensitive" } } },
      { vehicle: { plate: { contains: q, mode: "insensitive" } } },
      { items: { some: { name: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const rows = await prisma.serviceOrder.findMany({
    where,
    include: orderInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  res.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null });
});

ordersRouter.get("/orders/:id", async (req: AuthRequest, res) => {
  const order = await prisma.serviceOrder.findFirst({ where: { id: String(req.params.id), workshopId: ws(req) }, include: orderInclude });
  if (!order) throw notFound("Servis topilmadi");
  res.json(order);
});

export type CreateOrderInput = z.infer<typeof createSchema>;

/**
 * Creates a service order with its items, the first payment and stock moves.
 * Shared by the Mini App (POST /orders) and the Telegram voice flow.
 * A debt without a due date gets DEFAULT_DUE_DAYS so it is never forgotten.
 */
export async function createOrder(tx: Tx, workshopId: string, userId: string, body: CreateOrderInput) {
  const vehicle = await tx.vehicle.findFirst({ where: { id: body.vehicleId, customerId: body.customerId, workshopId } });
  if (!vehicle) throw notFound("Mijoz yoki avtomobil topilmadi");
  const items = await normalizeItems(tx, workshopId, body.items);
  const total = orderTotal(items);
  const paid = round2(Math.min(body.paid, total));
  const debt = round2(total - paid);
  const order = await tx.serviceOrder.create({
    data: {
      workshopId,
      customerId: body.customerId,
      vehicleId: body.vehicleId,
      createdById: userId,
      total,
      paid,
      debt,
      status: statusFor(debt),
      dueDate: debt > 0 ? toDate(body.dueDate) ?? dueDateInDays(DEFAULT_DUE_DAYS) : null,
      mileage: body.mileage ?? null,
      note: cleanText(body.note),
      items: { create: items },
    },
  });
  await adjustStock(tx, items, -1);
  if (paid > 0) {
    await tx.payment.create({
      data: { orderId: order.id, customerId: body.customerId, amount: paid, method: body.paymentMethod, note: "Boshlang‘ich to‘lov", createdById: userId },
    });
  }
  if (body.mileage != null) await tx.vehicle.update({ where: { id: vehicle.id }, data: { mileage: body.mileage } });
  return tx.serviceOrder.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
}

ordersRouter.post("/orders", async (req: AuthRequest, res) => {
  const body = createSchema.parse(req.body);
  const result = await prisma.$transaction((tx) => createOrder(tx, ws(req), req.user!.id, body));
  res.status(201).json(result);
});

const updateSchema = z.object({
  note: z.string().max(1000).optional().nullable(),
  dueDate: dueDateSchema,
  mileage: z.coerce.number().int().min(0).optional().nullable(),
  status: z.enum(["open", "in_progress"]).optional(),
  items: z.array(itemSchema).min(1, "Kamida bitta ish yoki detal kiriting").max(100).optional(),
});

ordersRouter.patch("/orders/:id", async (req: AuthRequest, res) => {
  const body = updateSchema.parse(req.body);
  if (body.items && req.user!.role === "staff") throw forbidden("Narxlarni faqat ega yoki admin o‘zgartira oladi");
  const workshopId = ws(req);

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.serviceOrder.findFirst({ where: { id: String(req.params.id), workshopId }, include: { items: true } });
    if (!order) throw notFound("Servis topilmadi");
    if (order.status === "cancelled") throw conflict("Bekor qilingan servisni o‘zgartirib bo‘lmaydi");

    const data: Prisma.ServiceOrderUpdateInput = {};
    if (body.note !== undefined) data.note = cleanText(body.note);
    if (body.dueDate !== undefined) {
      data.dueDate = toDate(body.dueDate);
      data.remindedAt = null;
    }
    if (body.mileage !== undefined) data.mileage = body.mileage;

    let debt = Number(order.debt);
    if (body.items) {
      const items = await normalizeItems(tx, workshopId, body.items);
      const total = orderTotal(items);
      const paid = Number(order.paid);
      if (total < paid) throw badRequest(`Yangi summa to‘langan summadan (${paid}) kam bo‘lishi mumkin emas`);
      debt = round2(total - paid);
      await adjustStock(tx, order.items, 1);
      await tx.orderItem.deleteMany({ where: { orderId: order.id } });
      await adjustStock(tx, items, -1);
      Object.assign(data, { total, debt, items: { create: items } });
      await audit(tx, { workshopId, userId: req.user!.id, action: "order.items_edited", entity: "order", entityId: order.id, details: `Jami: ${Number(order.total)} -> ${total}` });
      // optimistic lock: fail if a payment arrived in between
      const locked = await tx.serviceOrder.updateMany({ where: { id: order.id, paid: order.paid }, data: { updatedAt: new Date() } });
      if (locked.count !== 1) throw conflict("Servis boshqa foydalanuvchi tomonidan o‘zgartirildi, qayta urinib ko‘ring");
    }
    // a debt must always have a due date: cleared or missing -> default
    const nextDue = body.dueDate !== undefined ? toDate(body.dueDate) : order.dueDate;
    if (debt > 0 && !nextDue) {
      data.dueDate = dueDateInDays(DEFAULT_DUE_DAYS);
      data.remindedAt = null;
    }
    data.status = statusFor(debt, body.status ?? order.status);
    await tx.serviceOrder.update({ where: { id: order.id }, data });
    if (body.mileage != null) await tx.vehicle.update({ where: { id: order.vehicleId }, data: { mileage: body.mileage } });
    return tx.serviceOrder.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });
  res.json(result);
});

const cancelSchema = z.object({ reason: z.string().max(300).optional().nullable() });

ordersRouter.post("/orders/:id/cancel", managers, async (req: AuthRequest, res) => {
  const { reason } = cancelSchema.parse(req.body ?? {});
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.serviceOrder.findFirst({
      where: { id: String(req.params.id), workshopId: ws(req) },
      include: { items: true, _count: { select: { payments: true } } },
    });
    if (!order) throw notFound("Servis topilmadi");
    if (order.status === "cancelled") throw conflict("Servis allaqachon bekor qilingan");
    if (order._count.payments > 0) throw conflict("To‘lovi bor servisni bekor qilishdan oldin to‘lovlarni o‘chiring");
    await adjustStock(tx, order.items, 1);
    await audit(tx, { workshopId: ws(req), userId: req.user!.id, action: "order.cancelled", entity: "order", entityId: order.id, details: `Jami: ${Number(order.total)}${reason ? `; sabab: ${reason}` : ""}` });
    await tx.serviceOrder.update({
      where: { id: order.id },
      data: { status: "cancelled", debt: 0, cancelledAt: new Date(), cancelNote: cleanText(reason) },
    });
    return tx.serviceOrder.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });
  res.json(result);
});
