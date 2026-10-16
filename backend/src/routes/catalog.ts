import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { managers, ws, type AuthRequest } from "../middleware/auth.js";
import { notFound } from "../lib/http.js";

export const catalogRouter = Router();

const serviceSchema = z.object({
  name: z.string().trim().min(1, "Nomini kiriting").max(120),
  defaultPrice: z.coerce.number().min(0, "Narx manfiy bo‘lmasin").max(1e12),
});
const partSchema = serviceSchema.extend({ stock: z.coerce.number().min(-1e9).max(1e9).optional() });

catalogRouter.get("/services", async (req: AuthRequest, res) => {
  res.json(await prisma.service.findMany({ where: { workshopId: ws(req), active: true }, orderBy: { name: "asc" } }));
});

catalogRouter.post("/services", managers, async (req: AuthRequest, res) => {
  const body = serviceSchema.parse(req.body);
  res.status(201).json(await prisma.service.create({ data: { workshopId: ws(req), ...body } }));
});

catalogRouter.patch("/services/:id", managers, async (req: AuthRequest, res) => {
  const body = serviceSchema.partial().parse(req.body);
  const found = await prisma.service.findFirst({ where: { id: String(req.params.id), workshopId: ws(req) } });
  if (!found) throw notFound("Xizmat topilmadi");
  res.json(await prisma.service.update({ where: { id: found.id }, data: body }));
});

catalogRouter.delete("/services/:id", managers, async (req: AuthRequest, res) => {
  const found = await prisma.service.findFirst({ where: { id: String(req.params.id), workshopId: ws(req) } });
  if (!found) throw notFound("Xizmat topilmadi");
  // soft delete: old orders keep their link
  await prisma.service.update({ where: { id: found.id }, data: { active: false } });
  res.json({ ok: true });
});

catalogRouter.get("/parts", async (req: AuthRequest, res) => {
  res.json(await prisma.part.findMany({ where: { workshopId: ws(req), active: true }, orderBy: { name: "asc" } }));
});

catalogRouter.post("/parts", managers, async (req: AuthRequest, res) => {
  const body = partSchema.parse(req.body);
  res.status(201).json(await prisma.part.create({ data: { workshopId: ws(req), ...body, stock: body.stock ?? 0 } }));
});

catalogRouter.patch("/parts/:id", managers, async (req: AuthRequest, res) => {
  const body = partSchema.partial().parse(req.body);
  const found = await prisma.part.findFirst({ where: { id: String(req.params.id), workshopId: ws(req) } });
  if (!found) throw notFound("Detal topilmadi");
  res.json(await prisma.part.update({ where: { id: found.id }, data: body }));
});

catalogRouter.delete("/parts/:id", managers, async (req: AuthRequest, res) => {
  const found = await prisma.part.findFirst({ where: { id: String(req.params.id), workshopId: ws(req) } });
  if (!found) throw notFound("Detal topilmadi");
  await prisma.part.update({ where: { id: found.id }, data: { active: false } });
  res.json({ ok: true });
});
