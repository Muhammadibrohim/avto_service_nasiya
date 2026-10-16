import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

type Tx = Prisma.TransactionClient | typeof prisma;

/** Readable 8-char invite code without easily confused characters. */
export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export const DEFAULT_SETTINGS = {
  reminderEnabled: "true",
  reminderDays: "3",
} as const;

export type WorkshopSettings = { reminderEnabled: boolean; reminderDays: number };

export async function getSettings(workshopId: string, tx: Tx = prisma): Promise<WorkshopSettings> {
  const rows = await tx.setting.findMany({ where: { workshopId } });
  const map: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.value != null) map[r.key] = r.value;
  return {
    reminderEnabled: map.reminderEnabled !== "false",
    reminderDays: Math.min(30, Math.max(0, Number(map.reminderDays) || 0)),
  };
}

export async function saveSettings(workshopId: string, values: Partial<WorkshopSettings>, tx: Tx = prisma) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    await tx.setting.upsert({
      where: { workshopId_key: { workshopId, key } },
      create: { workshopId, key, value: String(value) },
      update: { value: String(value) },
    });
  }
}
