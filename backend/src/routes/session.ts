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

/**
 * Joins a workshop by invite code. A user who is already attached may switch
 * only if their current workshop is an empty one they own alone (the first app
 * version created such a workshop automatically for everybody who opened it).
 */
sessionRouter.post("/onboarding/join", auth, async (req: AuthRequest, res) => {
  const { code } = joinSchema.parse(req.body);
  const workshop = await prisma.workshop.findFirst({ where: { inviteCode: code.trim().toUpperCase(), status: "active" } });
  if (!workshop) throw notFound("Taklif kodi noto‘g‘ri yoki eskirgan");
  if (workshop.id === req.user!.workshopId) throw badRequest("Siz allaqachon shu ustaxonadasiz");

  await prisma.$transaction(async (tx) => {
    const current = req.user!.workshopId;
    if (current) {
      const [members, customers, orders] = await Promise.all([
        tx.member.count({ where: { workshopId: current } }),
        tx.customer.count({ where: { workshopId: current } }),
        tx.serviceOrder.count({ where: { workshopId: current } }),
      ]);
      if (req.user!.role !== "owner" || members > 1 || customers > 0 || orders > 0) {
        throw conflict("Siz allaqachon ma’lumotlari bor ustaxonaga biriktirilgansiz");
      }
      await tx.workshop.delete({ where: { id: current } });
    }
    // remove any other empty auto-created workshops so membership resolution stays unambiguous
    const leftovers = await tx.workshop.findMany({
      where: { ownerUserId: req.user!.id, id: { not: workshop.id }, customers: { none: {} }, orders: { none: {} } },
      select: { id: true },
    });
    if (leftovers.length) await tx.workshop.deleteMany({ where: { id: { in: leftovers.map((w) => w.id) } } });
    await tx.member.create({ data: { workshopId: workshop.id, userId: req.user!.id, role: "staff" } });
  });
  res.status(201).json(await sessionPayload(req.user!.id));
});
