import { Request, Response, NextFunction } from "express";
import { prisma } from "../db.js";

export type AuthRequest = Request & { user?: { id: string; role: string; workshopId?: string } };

export async function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const telegramId = req.header("x-telegram-id");
  if (!telegramId) return res.status(401).json({ error: "Telegram authentication required" });

  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) return res.status(401).json({ error: "User not registered" });

  const workshop = await prisma.workshop.findFirst({ where: { ownerUserId: user.id } });
  req.user = { id: user.id, role: user.role, workshopId: workshop?.id };
  next();
}