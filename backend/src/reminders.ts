import { prisma } from "./db.js";
import { addDays, localDateKey, localHour, startOfLocalDay } from "./lib/time.js";
import { getSettings } from "./lib/workshop.js";
import { escapeHtml, sendTelegramMessage } from "./telegram.js";

const money = (v: unknown) => new Intl.NumberFormat("ru-RU").format(Math.round(Number(v ?? 0))).replace(/ /g, " ");

type Options = { onlyChatId?: string; force?: boolean };

/**
 * Sends one summary message per workshop to its owner and admins listing debts
 * that are overdue or due within `reminderDays`. Each order is reminded at most
 * once per day (tracked with ServiceOrder.remindedAt) unless `force` is set.
 */
export async function runRemindersForWorkshop(workshopId: string, opts: Options = {}) {
  const settings = await getSettings(workshopId);
  if (!settings.reminderEnabled && !opts.force) return { sent: 0, orders: 0, skipped: "disabled" };

  const today = startOfLocalDay();
  const orders = await prisma.serviceOrder.findMany({
    where: {
      workshopId,
      status: { not: "cancelled" },
      debt: { gt: 0 },
      dueDate: { lt: addDays(today, settings.reminderDays + 1) },
      ...(!opts.force && { OR: [{ remindedAt: null }, { remindedAt: { lt: today } }] }),
    },
    include: { customer: true, vehicle: true },
    orderBy: { dueDate: "asc" },
  });
  if (!orders.length) {
    if (opts.onlyChatId) await sendTelegramMessage(opts.onlyChatId, "✅ Hozircha muddati yaqin yoki o‘tgan qarz yo‘q.");
    return { sent: opts.onlyChatId ? 1 : 0, orders: 0 };
  }

  const workshop = await prisma.workshop.findUniqueOrThrow({ where: { id: workshopId } });
  const total = orders.reduce((s, o) => s + Number(o.debt), 0);
  const lines = orders.slice(0, 25).map((o) => {
    const days = Math.round((startOfLocalDay(o.dueDate!).getTime() - today.getTime()) / 86400000);
    const when = days < 0 ? `⚠️ ${-days} kun kechikdi` : days === 0 ? "⏰ bugun" : `📅 ${days} kundan keyin`;
    const phone = o.customer.phone ? ` · +${o.customer.phone}` : "";
    return `• <b>${escapeHtml(o.customer.name)}</b>${phone}\n   🚗 ${escapeHtml(o.vehicle.plate)} · ${money(o.debt)} so‘m · ${when}`;
  });
  const more = orders.length > 25 ? `\n…va yana ${orders.length - 25} ta` : "";
  const text =
    `🔔 <b>${escapeHtml(workshop.name)}</b> — nasiya eslatmasi (${localDateKey(new Date())})\n\n` +
    lines.join("\n") + more +
    `\n\nJami: <b>${money(total)} so‘m</b> (${orders.length} ta servis)`;

  let recipients: string[];
  if (opts.onlyChatId) {
    recipients = [opts.onlyChatId];
  } else {
    const members = await prisma.member.findMany({ where: { workshopId, role: { in: ["owner", "admin"] } }, include: { user: true } });
    recipients = [...new Set(members.map((m) => m.user.telegramId).filter(Boolean) as string[])];
  }

  let sent = 0;
  for (const chatId of recipients) if (await sendTelegramMessage(chatId, text)) sent++;
  if (sent > 0 && !opts.force) {
    await prisma.serviceOrder.updateMany({ where: { id: { in: orders.map((o) => o.id) } }, data: { remindedAt: new Date() } });
  }
  return { sent, orders: orders.length };
}

export async function runAllReminders() {
  const workshops = await prisma.workshop.findMany({ where: { status: "active" }, select: { id: true } });
  let sent = 0;
  for (const w of workshops) {
    try {
      sent += (await runRemindersForWorkshop(w.id)).sent;
    } catch (e) {
      console.error("Reminder failed for workshop", w.id, e);
    }
  }
  return { workshops: workshops.length, sent };
}

/** In-process scheduler: checks every 15 minutes, sends after REMINDER_HOUR (local time). */
export function startReminderScheduler() {
  if (process.env.REMINDERS_ENABLED === "false" || !process.env.TELEGRAM_BOT_TOKEN) return;
  const hour = Number(process.env.REMINDER_HOUR ?? 9);
  let running = false;
  const tick = async () => {
    if (running || localHour() < hour) return;
    running = true;
    try {
      const r = await runAllReminders();
      if (r.sent) console.log(`Reminders sent: ${r.sent}`);
    } catch (e) {
      console.error("Reminder scheduler error:", e);
    } finally {
      running = false;
    }
  };
  setInterval(tick, 15 * 60 * 1000).unref();
  setTimeout(tick, 30 * 1000).unref();
}
