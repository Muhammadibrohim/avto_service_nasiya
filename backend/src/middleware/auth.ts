import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "@prisma/client";
import { prisma } from "../db.js";
import { validateTelegramInitData } from "../telegram.js";
import { forbidden, HttpError } from "../lib/http.js";

export type AuthUser = { id: string; telegramId: string; role: UserRole; workshopId?: string };
export type AuthRequest = Request & { user?: AuthUser };

/**
 * Finds the workshop membership of a user. Workshops created before the
 * Member table existed only have ownerUserId, so we lazily create the
 * owner membership for them.
 */
export async function resolveMembership(userId: string) {
  const member = await prisma.member.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
  if (member) return member;
  // The first app version auto-created an empty workshop for every user, so an
  // owner may have several. Prefer the one that actually holds data.
  const ownedAll = await prisma.workshop.findMany({
    where: { ownerUserId: userId },
    include: { _count: { select: { customers: true, orders: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!ownedAll.length) return null;
  const owned = ownedAll.reduce((best, w) =>
    w._count.customers + w._count.orders > best._count.customers + best._count.orders ? w : best,
  );
  return prisma.member.upsert({
    where: { workshopId_userId: { workshopId: owned.id, userId } },
    create: { workshopId: owned.id, userId, role: "owner" },
    update: {},
  });
}

export async function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const initData = req.header("x-telegram-init-data");
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!initData || !botToken) return res.status(401).json({ error: "Telegram orqali kirish talab qilinadi" });

  let tgId: string;
  try {
    tgId = String(validateTelegramInitData(initData, botToken).user.id);
  } catch (error) {
    return res.status(401).json({ error: error instanceof Error ? error.message : "Authentication failed" });
  }

  const user = await prisma.user.findUnique({ where: { telegramId: tgId } });
  if (!user || user.status !== "active") return res.status(401).json({ error: "Foydalanuvchi ro‘yxatdan o‘tmagan" });

  const member = await resolveMembership(user.id);
  req.user = { id: user.id, telegramId: tgId, role: member?.role ?? "staff", workshopId: member?.workshopId };
  next();
}

/** Requires the user to belong to a workshop. Use after `auth`. */
export function requireWorkshop(req: AuthRequest, _res: Response, next: NextFunction) {
  if (!req.user?.workshopId) return next(new HttpError(403, "Avval ustaxona yarating yoki taklif kodi bilan qo‘shiling"));
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

export const managers = requireRole("owner", "admin");

/** Returns the workshop id of an authenticated request (guaranteed by requireWorkshop). */
export function ws(req: AuthRequest): string {
  return req.user!.workshopId!;
}
