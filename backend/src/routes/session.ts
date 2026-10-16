import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { telegramAuth } from "../middleware/telegramAuth.js";
import { auth, resolveMembership, type AuthRequest } from "../middleware/auth.js";
import { badRequest, conflict, notFound } from "../lib/http.js";
import { generateInviteCode, getSettings } from "../lib/workshop.js";
import { cleanText, normalizePhone } from "../lib/normalize.js";

export const sessionRouter = Router();

async function sessionPayload(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const member = await resolveMembership(userId);
  const workshop = member ? await prisma.workshop.findUnique({ where: { id: member.workshopId } }) : null;
  const role = member?.role ?? null;
  return {
    user: { id: user.id, name: user.name, username: user.username, telegramId: user.telegramId },
    role,
    workshop: workshop
      ? {
          id: workshop.id,
          name: workshop.name,
          phone: workshop.phone,
          address: workshop.address,
          // only managers may see / share the invite code
          inviteCode: role === "owner" || role === "admin" ? workshop.inviteCode : undefined,
        }
      : null,
    settings: workshop ? await getSettings(workshop.id) : null,
    needsOnboarding: !workshop,
  };
}

/** Called by the Mini App on start: creates or refreshes the Telegram user. */
sessionRouter.post("/auth/telegram", telegramAuth, async (req, res) => {
  const tg = req.telegramUser!;
  const telegramId = String(tg.id);
  const name = [tg.first_name, tg.last_name].filter(Boolean).join(" ").trim() || tg.username || "Telegram user";
  const user = await prisma.user.upsert({
    where: { telegramId },
    create: { telegramId, name, username: tg.username, role: "owner", status: "active" },
    update: { name, username: tg.username },
  });
  res.json(await sessionPayload(user.id));
});

sessionRouter.get("/me", auth, async (req: AuthRequest, res) => {
  res.json(await sessionPayload(req.user!.id));
});

const createWorkshopSchema = z.object({
  name: z.string().trim().min(2, "Ustaxona nomini kiriting").max(80),
  phone: z.string().optional().nullable(),
  address: z.string().max(200).optional().nullable(),
});

sessionRouter.post("/onboarding/workshop", auth, async (req: AuthRequest, res) => {
  if (req.user!.workshopId) throw conflict("Siz allaqachon ustaxonaga biriktirilgansiz");
  const body = createWorkshopSchema.parse(req.body);
  await prisma.$transaction(async (tx) => {
    const workshop = await tx.workshop.create({
      data: {
        name: body.name,
        phone: normalizePhone(body.phone),
        address: cleanText(body.address),
        ownerUserId: req.user!.id,
        inviteCode: generateInviteCode(),
      },
    });
    await tx.member.create({ data: { workshopId: workshop.id, userId: req.user!.id, role: "owner" } });
  });
  res.status(201).json(await sessionPayload(req.user!.id));
});

const joinSchema = z.object({ code: z.string().trim().min(4, "Taklif kodini kiriting") });

sessionRouter.post("/onboarding/join", auth, async (req: AuthRequest, res) => {
  if (req.user!.workshopId) throw conflict("Siz allaqachon ustaxonaga biriktirilgansiz");
  const { code } = joinSchema.parse(req.body);
  const workshop = await prisma.workshop.findFirst({ where: { inviteCode: code.toUpperCase(), status: "active" } });
  if (!workshop || workshop.status !== "active") throw notFound("Taklif kodi noto‘g‘ri yoki eskirgan");
  if (workshop.ownerUserId === req.user!.id) throw badRequest("Bu sizning ustaxonangiz");
  await prisma.member.create({ data: { workshopId: workshop.id, userId: req.user!.id, role: "staff" } });
  res.status(201).json(await sessionPayload(req.user!.id));
});
