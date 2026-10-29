import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

type Tx = Prisma.TransactionClient | typeof prisma;

export type AuditEntry = {
  workshopId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: string | null;
};

/** Records a sensitive action. Call it inside the action's transaction so the log and the change succeed or fail together. */
export async function audit(tx: Tx, e: AuditEntry) {
  await tx.auditLog.create({
    data: {
      workshopId: e.workshopId,
      userId: e.userId ?? null,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId ?? null,
      details: e.details ? e.details.slice(0, 500) : null,
    },
  });
}
