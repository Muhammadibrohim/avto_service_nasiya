import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { managers, ws, type AuthRequest } from "../middleware/auth.js";
import { conflict, notFound } from "../lib/http.js";
import { cleanText, normalizePhone, normalizePlate } from "../lib/normalize.js";

export const customersRouter = Router();

const vehicleSchema = z.object({
  make: z.string().trim().min(1, "Mashina markasini kiriting").max(60),
  model: z.string().max(60).optional().nullable(),
  plate: z.string().trim().min(2, "Davlat raqamini kiriting").max(20),
  year: z.coerce.number().int().min(1950).max(2100).optional().nullable(),
  color: z.string().max(30).optional().nullable(),
  vin: z.string().max(40).optional().nullable(),
  mileage: z.coerce.number().int().min(0).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

const customerSchema = z.object({
  name: z.string().trim().min(2, "Mijoz ismini kiriting").max(80),
  phone: z
    .string()
    .trim()
    .refine((v) => (normalizePhone(v)?.length ?? 0) >= 9, "Telefon raqamini to‘g‘ri kiriting"),
  notes: z.string().max(500).optional().nullable(),
  vehicle: vehicleSchema.optional(),
});

function vehicleData(v: z.infer<typeof vehicleSchema>) {
  return {
    make: v.make.trim(),
    model: cleanText(v.model),
    plate: normalizePlate(v.plate),
    year: v.year ?? null,
    color: cleanText(v.color),
    vin: cleanText(v.vin)?.toUpperCase() ?? null,
    mileage: v.mileage ?? null,
    notes: cleanText(v.notes),
  };
}

/** Sum of open (non-cancelled) debt per customer. */
async function debtByCustomer(workshopId: string, customerIds?: string[]) {
  const rows = await prisma.serviceOrder.groupBy({
    by: ["customerId"],
    where: { workshopId, status: { not: "cancelled" }, debt: { gt: 0 }, ...(customerIds && { customerId: { in: customerIds } }) },
    _sum: { debt: true },
  });
  return new Map(rows.map((r) => [r.customerId, Number(r._sum.debt ?? 0)]));
}

customersRouter.get("/customers", async (req: AuthRequest, res) => {
  const q = String(req.query.q || "").trim();
  const digits = q.replace(/\D/g, "");
  const plate = normalizePlate(q);
  const where: Prisma.CustomerWhereInput = { workshopId: ws(req) };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      ...(plate.length >= 2 ? [{ vehicles: { some: { plate: { contains: plate } } } }] : []),
    ];
  }
  const customers = await prisma.customer.findMany({
    where,
    include: { vehicles: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(req.query.take) || 500, 1000),
  });
  const debts = await debtByCustomer(ws(req), customers.map((c) => c.id));
  res.json(customers.map((c) => ({ ...c, debt: debts.get(c.id) ?? 0 })));
});

customersRouter.get("/customers/:id", async (req: AuthRequest, res) => {
  const customer = await prisma.customer.findFirst({
    where: { id: String(req.params.id), workshopId: ws(req) },
    include: {
      vehicles: { orderBy: { createdAt: "asc" } },
      orders: {
        include: { vehicle: true, items: true, payments: { orderBy: { createdAt: "desc" } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!customer) throw notFound("Mijoz topilmadi");
  const active = customer.orders.filter((o) => o.status !== "cancelled");
  const summary = {
    total: active.reduce((s, o) => s + Number(o.total), 0),
    paid: active.reduce((s, o) => s + Number(o.paid), 0),
    debt: active.reduce((s, o) => s + Number(o.debt), 0),
  };
  res.json({ ...customer, summary });
});

async function createCustomer(req: AuthRequest) {
  const body = customerSchema.parse(req.body);
  return prisma.customer.create({
    data: {
      workshopId: ws(req),
      name: body.name,
      phone: normalizePhone(body.phone),
      notes: cleanText(body.notes),
      ...(body.vehicle && { vehicles: { create: { workshopId: ws(req), ...vehicleData(body.vehicle) } } }),
    },
    include: { vehicles: true },
  });
}

customersRouter.post("/customers", async (req: AuthRequest, res) => {
  res.status(201).json(await createCustomer(req));
});

// Backwards-compatible endpoint used by the first frontend version.
customersRouter.post("/customers/with-vehicle", async (req: AuthRequest, res) => {
  const { name, phone, make, model, plate } = req.body ?? {};
  req.body = { name, phone, vehicle: { make, model, plate } };
  res.status(201).json(await createCustomer(req));
});

const customerUpdateSchema = customerSchema.omit({ vehicle: true }).partial();

customersRouter.patch("/customers/:id", async (req: AuthRequest, res) => {
  const body = customerUpdateSchema.parse(req.body);
  const existing = await prisma.customer.findFirst({ where: { id: String(req.params.id), workshopId: ws(req) } });
  if (!existing) throw notFound("Mijoz topilmadi");
  const customer = await prisma.customer.update({
    where: { id: existing.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.phone !== undefined && { phone: normalizePhone(body.phone) }),
      ...(body.notes !== undefined && { notes: cleanText(body.notes) }),
    },
    include: { vehicles: true },
  });
  res.json(customer);
});

customersRouter.delete("/customers/:id", managers, async (req: AuthRequest, res) => {
  const existing = await prisma.customer.findFirst({
    where: { id: String(req.params.id), workshopId: ws(req) },
    include: { _count: { select: { orders: true } } },
  });
  if (!existing) throw notFound("Mijoz topilmadi");
  if (existing._count.orders > 0) throw conflict("Servis tarixi bor mijozni o‘chirib bo‘lmaydi");
  await prisma.customer.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

const vehicleCreateSchema = vehicleSchema.extend({ customerId: z.string().min(1, "Mijozni tanlang") });

customersRouter.post("/vehicles", async (req: AuthRequest, res) => {
  const body = vehicleCreateSchema.parse(req.body);
  const customer = await prisma.customer.findFirst({ where: { id: body.customerId, workshopId: ws(req) } });
  if (!customer) throw notFound("Mijoz topilmadi");
  const vehicle = await prisma.vehicle.create({ data: { workshopId: ws(req), customerId: customer.id, ...vehicleData(body) } });
  res.status(201).json(vehicle);
});

customersRouter.patch("/vehicles/:id", async (req: AuthRequest, res) => {
  const existing = await prisma.vehicle.findFirst({ where: { id: String(req.params.id), workshopId: ws(req) } });
  if (!existing) throw notFound("Avtomobil topilmadi");
  const { make, model, plate, year, color, vin, mileage, notes } = existing;
  const body = vehicleSchema.parse({ make, model, plate, year, color, vin, mileage, notes, ...req.body });
  res.json(await prisma.vehicle.update({ where: { id: existing.id }, data: vehicleData(body) }));
});

customersRouter.delete("/vehicles/:id", managers, async (req: AuthRequest, res) => {
  const existing = await prisma.vehicle.findFirst({
    where: { id: String(req.params.id), workshopId: ws(req) },
    include: { _count: { select: { orders: true } } },
  });
  if (!existing) throw notFound("Avtomobil topilmadi");
  if (existing._count.orders > 0) throw conflict("Servis tarixi bor avtomobilni o‘chirib bo‘lmaydi");
  await prisma.vehicle.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});
