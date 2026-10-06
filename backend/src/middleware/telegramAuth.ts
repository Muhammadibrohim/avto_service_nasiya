import type { Request, Response, NextFunction } from "express";
import { validateTelegramInitData } from "../telegram.js";

declare global {
  namespace Express {
    interface Request {
      telegramUser?: {
        id: number;
        first_name?: string;
        last_name?: string;
        username?: string;
      };
    }
  }
}

export function telegramAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const initData = req.header("x-telegram-init-data");
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!initData || !botToken) {
      return res.status(401).json({ error: "Telegram authentication required" });
    }

    const result = validateTelegramInitData(initData, botToken);
    req.telegramUser = result.user;
    next();
  } catch (error) {
    return res.status(401).json({
      error: error instanceof Error ? error.message : "Telegram authentication failed",
    });
  }
}
