import { prisma } from "../db.js";
import { audit } from "../lib/audit.js";
import { localDateKey } from "../lib/time.js";
import { createOrder } from "../routes/orders.js";
import { escapeHtml, appUrl, type InlineKeyboard } from "../telegram.js";
import type { CatalogEntry, Extraction } from "./extract.js";
import { buildItems, buildMoney, cleanPhone, cleanPlate, PlanProblem, type Plan } from "./plan.js";

export const DRAFT_TTL_MS = 30 * 60 * 1000;

export async function loadCatalog(workshopId: string): Promise<CatalogEntry[]> {
  const [services, parts] = await Promise.all([
    prisma.service.findMany({ where: { workshopId, active: true }, select: { id: true, name: true, defaultPrice: true } }),
    prisma.part.findMany({ where: { workshopId, active: true }, select: { id: true, name: true, defaultPrice: true } }),
  ]);
  return [
    ...services.map((s) => ({ id: s.id, name: s.name, price: Number(s.defaultPrice), kind: "service" as const })),
    ...parts.map((p) => ({ id: p.id, name: p.name, price: Number(p.defaultPrice), kind: "part" as const })),
  ];
}

/** Matches the spoken customer/car against the workshop's data: plate first, then phone, then a unique name. */
export async function buildPlan(workshopId: string, ex: Extraction, catalog: CatalogEntry[]): Promise<Plan> {
  if (!ex.isServiceOrder || !ex.items.length) {
    throw new PlanProblem("Xabardan servis topilmadi. Mijoz, mashina raqami, qilingan ish va narxini ayting.");
  }
  const items = buildItems(ex.items, catalog);
  const money = buildMoney(ex, items);
  const plate = cleanPlate(ex.plate);
  const phone = cleanPhone(ex.phone);

  let customer: Plan["customer"] | null = null;
  let vehicle: Plan["vehicle"] | null = null;

  if (plate) {
    const v = await prisma.vehicle.findFirst({ where: { workshopId, plate }, include: { customer: true } });
    if (v) {
      customer = { id: v.customer.id, name: v.customer.name, phone: v.customer.phone };
      vehicle = { id: v.id, make: v.make, model: v.model, plate: v.plate };
    }
  }
  if (!customer && phone) {
    const c = await prisma.customer.findFirst({ where: { workshopId, phone } });
    if (c) customer = { id: c.id, name: c.name, phone: c.phone };
  }
  if (!customer && ex.customerName && ex.customerName.trim().length >= 2) {
    const found = await prisma.customer.findMany({
      where: { workshopId, name: { contains: ex.customerName.trim(), mode: "insensitive" } },
      take: 2,
    });
    if (found.length === 1) customer = { id: found[0].id, name: found[0].name, phone: found[0].phone };
  }

  if (!customer) {
    const name = ex.customerName?.trim();
    if (!name || name.length < 2) throw new PlanProblem("Mijoz topilmadi. Mijoz ismini yoki mashina raqamini ham ayting.");
    customer = { name, phone };
  }

  if (!vehicle) {
    if (customer.id) {
      const vs = await prisma.vehicle.findMany({ where: { workshopId, customerId: customer.id } });
      const same = plate ? vs.find((v) => v.plate === plate) : vs.length === 1 ? vs[0] : undefined;
      if (same) vehicle = { id: same.id, make: same.make, model: same.model, plate: same.plate };
      else if (!plate) {
        throw new PlanProblem(vs.length > 1
          ? `${customer.name}ning ${vs.length} ta mashinasi bor (${vs.map((v) => v.plate).join(", ")}). Qaysi raqam ekanini ayting.`
          : "Mashina davlat raqamini ham ayting.");
      }
    } else if (!plate) {
      throw new PlanProblem("Yangi mijoz uchun mashina davlat raqamini ham ayting.");
    }
    if (!vehicle) vehicle = { make: ex.carMake?.trim() || "Noma’lum", model: ex.carModel?.trim() || null, plate: plate! };
  }

  return {
    customer,
    vehicle,
    items,
    ...money,
    mileage: ex.mileage,
    note: ex.note?.trim() || null,
  };
}

const fmt = (v: number) => new Intl.NumberFormat("ru-RU").format(Math.round(v)).replace(/\s/g, " ");
const ddmmyyyy = (key: string) => key.split("-").reverse().join(".");
const METHOD: Record<string, string> = { cash: "naqd", card: "karta", transfer: "o‘tkazma" };

export function planMessage(plan: Plan, transcript: string): string {
  const e = escapeHtml;
  const lines = [
    `🎙 <i>“${e(transcript.slice(0, 400))}”</i>`,
    "",
    `👤 <b>${e(plan.customer.name)}</b>${plan.customer.phone ? ` · +${e(plan.customer.phone)}` : ""}${plan.customer.id ? "" : " <b>(yangi mijoz)</b>"}`,
    `🚗 ${e(`${plan.vehicle.make} ${plan.vehicle.model ?? ""}`.trim())} · <b>${e(plan.vehicle.plate)}</b>${plan.vehicle.id ? "" : " <b>(yangi)</b>"}`,
    "",
    ...plan.items.map((i) => `• ${e(i.name)} — ${fmt(i.quantity)} × ${fmt(i.unitPrice)} = ${fmt(i.quantity * i.unitPrice)}`),
    "",
    `Jami: <b>${fmt(plan.total)} so‘m</b>`,
    `To‘landi: ${fmt(plan.paid)} so‘m${plan.paid > 0 ? ` (${METHOD[plan.paymentMethod]})` : ""}`,
  ];
  if (plan.debt > 0 && plan.dueDate) {
    lines.push(`Nasiya: <b>${fmt(plan.debt)} so‘m</b> — ${ddmmyyyy(plan.dueDate)} gacha${plan.dueIsDefault ? " (standart 7 kun)" : ""}`);
  } else {
    lines.push("✅ To‘liq to‘langan");
  }
  if (plan.mileage) lines.push(`Probeg: ${fmt(plan.mileage)} km`);
  if (plan.note) lines.push(`Izoh: ${e(plan.note)}`);
  lines.push("", "Hammasi to‘g‘rimi? Xato bo‘lsa — bekor qilib, qaytadan ayting.");
  return lines.join("\n");
}

export function draftKeyboard(draftId: string): InlineKeyboard {
  return [[
    { text: "✅ Saqlash", callback_data: `vd:s:${draftId}` },
    { text: "❌ Bekor qilish", callback_data: `vd:c:${draftId}` },
  ]];
}

export function openAppKeyboard(orderId?: string): InlineKeyboard | undefined {
  const url = appUrl();
  if (!url) return undefined;
  return [[{ text: "🔧 Ilovada ochish", web_app: { url: orderId ? `${url.replace(/#.*$/, "")}#order=${orderId}` : url } }]];
}

/**
 * Saves a confirmed draft. The status switch pending -> saving is atomic, so a
 * double tap or a Telegram retry can never create the order twice.
 */
export async function confirmDraft(draftId: string, userId: string) {
  const claimed = await prisma.voiceDraft.updateMany({
    where: { id: draftId, userId, status: "pending", expiresAt: { gt: new Date() } },
    data: { status: "saving" },
  });
  if (claimed.count !== 1) return { ok: false as const, reason: "expired" as const };
  const draft = await prisma.voiceDraft.findUniqueOrThrow({ where: { id: draftId } });

  // the membership may have been removed since the draft was made
  const member = await prisma.member.findFirst({ where: { userId, workshopId: draft.workshopId } });
  if (!member) {
    await prisma.voiceDraft.update({ where: { id: draftId }, data: { status: "failed" } });
    return { ok: false as const, reason: "forbidden" as const };
  }

  const plan = draft.data as unknown as Plan;
  try {
    const order = await prisma.$transaction(async (tx) => {
      let customerId = plan.customer.id;
      if (customerId) {
        const c = await tx.customer.findFirst({ where: { id: customerId, workshopId: draft.workshopId } });
        if (!c) throw new PlanProblem("Mijoz o‘chirilgan. Qaytadan yuboring.");
      } else {
        const c = await tx.customer.create({ data: { workshopId: draft.workshopId, name: plan.customer.name, phone: plan.customer.phone } });
        customerId = c.id;
      }
      let vehicleId = plan.vehicle.id;
      if (vehicleId) {
        const v = await tx.vehicle.findFirst({ where: { id: vehicleId, workshopId: draft.workshopId, customerId } });
        if (!v) throw new PlanProblem("Avtomobil topilmadi. Qaytadan yuboring.");
      } else {
        const v = await tx.vehicle.create({
          data: { workshopId: draft.workshopId, customerId, make: plan.vehicle.make, model: plan.vehicle.model, plate: plan.vehicle.plate },
        });
        vehicleId = v.id;
      }
      const created = await createOrder(tx, draft.workshopId, userId, {
        customerId,
        vehicleId,
        items: plan.items.map((i) => ({ ...i })),
        paid: plan.paid,
        paymentMethod: plan.paymentMethod,
        dueDate: plan.dueDate,
        note: plan.note ? `🎙 ${plan.note}` : "🎙 Ovozli xabar orqali",
        mileage: plan.mileage,
      });
      await audit(tx, {
        workshopId: draft.workshopId, userId, action: "order.voice_created", entity: "order", entityId: created.id,
        details: draft.transcript,
      });
      return created;
    });
    await prisma.voiceDraft.update({ where: { id: draftId }, data: { status: "saved", orderId: order.id } });
    return { ok: true as const, order, plan };
  } catch (e) {
    await prisma.voiceDraft.update({ where: { id: draftId }, data: { status: "failed" } });
    throw e;
  }
}

export async function cancelDraft(draftId: string, userId: string) {
  const r = await prisma.voiceDraft.updateMany({ where: { id: draftId, userId, status: "pending" }, data: { status: "cancelled" } });
  return r.count === 1;
}

export function todayKey() {
  return localDateKey(new Date());
}
