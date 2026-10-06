import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db.js";
import { validateTelegramInitData } from "../telegram.js";

export type AuthRequest = Request & { user?: { id: string; role: string; workshopId?: string } };

export async function auth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const initData = req.header("x-telegram-init-data");
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!initData || !botToken) return res.status(401).json({ error: "Telegram authentication required" });

    const { user: tg } = validateTelegramInitData(initData, botToken);
    const user = await prisma.user.findUnique({ where: { telegramId: String(tg.id) } });
    if (!user) return res.status(401).json({ error: "User not registered" });

    const workshop = await prisma.workshop.findFirst({ where: { ownerUserId: user.id } });
    req.user = { id: user.id, role: user.role, workshopId: workshop?.id };
    next();
  } catch (error) {
    return res.status(401).json({ error: error instanceof Error ? error.message : "Authentication failed" });
  }
}
