import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { managers, requireRole, ws, type AuthRequest } from "../middleware/auth.js";
import { badRequest, forbidden, notFound } from "../lib/http.js";
import { generateInviteCode, getSettings, saveSettings } from "../lib/workshop.js";
import { cleanText, normalizePhone } from "../lib/normalize.js";
import { runRemindersForWorkshop } from "../reminders.js";

export const workshopRouter = Router();

const updateSchema = z.object({
  name: z.string().trim().min(2, "Ustaxona nomini kiriting").max(80).optional(),
  phone: z.string().optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  settings: z
    .object({
      reminderEnabled: z.boolean().optional(),
      reminderDays: z.coerce.number().int().min(0).max(30).optional(),
    })
    .optional(),
});

workshopRouter.patch("/workshop", managers, async (req: AuthRequest, res) => {
  const body = updateSchema.parse(req.body);
  const workshop = await prisma.workshop.update({
    where: { id: ws(req) },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.phone !== undefined && { phone: normalizePhone(body.phone) }),
      ...(body.address !== undefined && { address: cleanText(body.address) }),
    },
  });
  if (body.settings) await saveSettings(ws(req), body.settings);
  res.json({ workshop, settings: await getSettings(ws(req)) });
});

workshopRouter.post("/workshop/invite", managers, async (req: AuthRequest, res) => {
  const workshop = await prisma.workshop.update({ where: { id: ws(req) }, data: { inviteCode: generateInviteCode() } });
  res.json({ inviteCode: workshop.inviteCode });
});

workshopRouter.get("/members", async (req: AuthRequest, res) => {
  const members = await prisma.member.findMany({
    where: { workshopId: ws(req) },
    include: { user: { select: { id: true, name: true, username: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(members);
});

const roleSchema = z.object({ role: z.enum(["admin", "staff"], "Rol noto‘g‘ri") });

workshopRouter.patch("/members/:id", requireRole("owner"), async (req: AuthRequest, res) => {
  const { role } = roleSchema.parse(req.body);
  const member = await prisma.member.findFirst({ where: { id: String(req.params.id), workshopId: ws(req) } });
  if (!member) throw notFound("Xodim topilmadi");
  if (member.role === "owner") throw badRequest("Egasining rolini o‘zgartirib bo‘lmaydi");
  res.json(await prisma.member.update({ where: { id: member.id }, data: { role } }));
});

workshopRouter.delete("/members/:id", managers, async (req: AuthRequest, res) => {
  const member = await prisma.member.findFirst({ where: { id: String(req.params.id), workshopId: ws(req) } });
  if (!member) throw notFound("Xodim topilmadi");
  if (member.role === "owner") throw badRequest("Ustaxona egasini o‘chirib bo‘lmaydi");
  if (member.userId === req.user!.id) throw badRequest("O‘zingizni o‘chira olmaysiz");
  if (member.role === "admin" && req.user!.role !== "owner") throw forbidden("Adminni faqat ega o‘chira oladi");
  await prisma.member.delete({ where: { id: member.id } });
  res.json({ ok: true });
});

/** Sends the debt reminder for this workshop right now (to the caller only). */
workshopRouter.post("/reminders/test", managers, async (req: AuthRequest, res) => {
  const result = await runRemindersForWorkshop(ws(req), { onlyChatId: req.user!.telegramId, force: true });
  res.json(result);
});
