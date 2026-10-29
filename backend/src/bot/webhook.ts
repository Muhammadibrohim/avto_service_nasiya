import { Router } from "express";
import { prisma } from "../db.js";
import { resolveMembership } from "../middleware/auth.js";
import { HttpError } from "../lib/http.js";
import { RateLimiter } from "../lib/rateLimit.js";
import { downloadTelegramFile, editMessage, escapeHtml, safeEqual, sendMessage, tgCall, webhookSecret } from "../telegram.js";
import { extractOrder, extractorConfigured } from "./extract.js";
import { PlanProblem } from "./plan.js";
import { transcribe, sttConfigured } from "./stt.js";
import { buildPlan, cancelDraft, confirmDraft, draftKeyboard, DRAFT_TTL_MS, loadCatalog, openAppKeyboard, planMessage, todayKey } from "./voice.js";

const MAX_VOICE_SECONDS = 120;
const MAX_VOICE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT = 1000;

/** Per-user limits protect the UzbekVoice / Claude budget from spam. */
const perHour = new RateLimiter(Number(process.env.VOICE_LIMIT_PER_HOUR || 20), 60 * 60 * 1000);
const perMinute = new RateLimiter(4, 60 * 1000);

type TgUser = { id: number; is_bot?: boolean };
type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
  voice?: { file_id: string; duration: number; file_size?: number; mime_type?: string };
  audio?: { file_id: string; duration: number; file_size?: number; mime_type?: string; file_name?: string };
};
type TgCallback = { id: string; from: TgUser; data?: string; message?: { message_id: number; chat: { id: number } } };
type TgUpdate = { update_id: number; message?: TgMessage; callback_query?: TgCallback };

/** Telegram re-sends an update if we were slow; remember recent ids so nothing runs twice. */
const seen = new Map<number, number>();
function firstTime(updateId: number): boolean {
  const now = Date.now();
  if (seen.has(updateId)) return false;
  seen.set(updateId, now);
  if (seen.size > 2000) for (const [k, t] of seen) if (now - t > 3600_000) seen.delete(k);
  return true;
}

export const botRouter = Router();

botRouter.post("/telegram/webhook", (req, res) => {
  const expected = webhookSecret();
  const got = req.header("x-telegram-bot-api-secret-token") ?? "";
  if (!expected || !safeEqual(got, expected)) return res.status(401).json({ error: "Unauthorized" });
  // answer at once: Telegram retries slow webhooks, and speech recognition takes seconds
  res.json({ ok: true });
  const update = req.body as TgUpdate;
  if (typeof update?.update_id !== "number" || !firstTime(update.update_id)) return;
  void handleUpdate(update).catch((e) => console.error("Bot update failed:", e instanceof Error ? e.message : e));
});

async function handleUpdate(u: TgUpdate) {
  if (u.callback_query) return handleCallback(u.callback_query);
  const m = u.message;
  if (!m?.from || m.from.is_bot || m.chat.type !== "private") return; // groups are ignored on purpose
  const chatId = m.chat.id;

  if (m.text?.startsWith("/start") || m.text === "/help") return sendWelcome(chatId, m.from.id);
  if (m.text?.startsWith("/")) return;
  if (!m.voice && !m.audio && !m.text) return;

  const user = await prisma.user.findUnique({ where: { telegramId: String(m.from.id) } });
  const member = user?.status === "active" ? await resolveMembership(user.id) : null;
  if (!user || !member) {
    await sendMessage(chatId, "🔒 Bu bot faqat ustaxona xodimlari uchun. Avval pastdagi tugma orqali ilovani oching va ustaxonaga qo‘shiling.", openAppKeyboard());
    return;
  }
  if (!sttConfigured() && (m.voice || m.audio)) return void sendMessage(chatId, "⚙️ Ovozli kiritish hali sozlanmagan (UZBEKVOICE_API_KEY).");
  if (!extractorConfigured()) return void sendMessage(chatId, "⚙️ Ovozli kiritish hali sozlanmagan (ANTHROPIC_API_KEY).");

  const key = String(m.from.id);
  if (!perMinute.take(key) || !perHour.take(key)) {
    await sendMessage(chatId, "⏳ Juda ko‘p xabar yuborildi. Birozdan keyin qayta urinib ko‘ring.");
    return;
  }

  const media = m.voice ?? m.audio;
  if (media && (media.duration > MAX_VOICE_SECONDS || (media.file_size ?? 0) > MAX_VOICE_BYTES)) {
    await sendMessage(chatId, `🎙 Ovozli xabar ${MAX_VOICE_SECONDS / 60} daqiqadan oshmasin.`);
    return;
  }
  if (!media && m.text!.length > MAX_TEXT) {
    await sendMessage(chatId, "Xabar juda uzun. Bitta servisni qisqa qilib yozing.");
    return;
  }

  const status = await sendMessage(chatId, media ? "🎧 Eshitayapman…" : "⏳ Tahlil qilyapman…");
  try {
    let transcript = m.text?.trim() ?? "";
    if (media) {
      const audio = await downloadTelegramFile(media.file_id, MAX_VOICE_BYTES);
      transcript = await transcribe(audio, m.audio?.file_name || "voice.ogg", media.mime_type || "audio/ogg");
      await editMessage(chatId, status.message_id, `🎙 <i>“${escapeHtml(transcript.slice(0, 400))}”</i>\n\n⏳ Tahlil qilyapman…`);
    }
    const catalog = await loadCatalog(member.workshopId);
    const extraction = await extractOrder(transcript, catalog, todayKey());
    const plan = await buildPlan(member.workshopId, extraction, catalog);

    // only the newest draft of a user stays active
    await prisma.voiceDraft.updateMany({ where: { userId: user.id, status: "pending" }, data: { status: "cancelled" } });
    const draft = await prisma.voiceDraft.create({
      data: {
        workshopId: member.workshopId, userId: user.id, chatId: String(chatId), messageId: status.message_id,
        transcript, data: plan as object, expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
      },
    });
    await editMessage(chatId, status.message_id, planMessage(plan, transcript), draftKeyboard(draft.id));
  } catch (e) {
    if (e instanceof PlanProblem) {
      await editMessage(chatId, status.message_id, `🤔 ${escapeHtml(e.message)}`);
    } else {
      console.error("Voice entry failed:", e instanceof Error ? e.message : e);
      await editMessage(chatId, status.message_id, "❌ Xabarni qayta ishlab bo‘lmadi. Birozdan keyin qayta urinib ko‘ring yoki ilovada kiriting.");
    }
  }
}

async function handleCallback(q: TgCallback) {
  const answer = (text?: string) => tgCall("answerCallbackQuery", { callback_query_id: q.id, ...(text && { text }) }).catch(() => undefined);
  const match = /^vd:([sc]):([a-z0-9]{10,40})$/.exec(q.data ?? "");
  const chatId = q.message?.chat.id;
  const messageId = q.message?.message_id;
  if (!match || !chatId || !messageId) return answer();

  const user = await prisma.user.findUnique({ where: { telegramId: String(q.from.id) } });
  if (!user || user.status !== "active") return answer("Ruxsat yo‘q");
  const [, action, draftId] = match;

  if (action === "c") {
    await cancelDraft(draftId, user.id);
    await answer("Bekor qilindi");
    return editMessage(chatId, messageId, "❌ Bekor qilindi. Qaytadan aytishingiz mumkin.");
  }

  await answer("Saqlanmoqda…");
  try {
    const r = await confirmDraft(draftId, user.id);
    if (!r.ok) {
      const text = r.reason === "forbidden" ? "🔒 Siz endi bu ustaxonada emassiz." : "⌛ Bu qoralama eskirgan yoki allaqachon saqlangan.";
      return editMessage(chatId, messageId, text);
    }
    const debt = Number(r.order.debt);
    await editMessage(
      chatId,
      messageId,
      `✅ <b>Saqlandi</b>\n👤 ${escapeHtml(r.order.customer.name)} · 🚗 ${escapeHtml(r.order.vehicle.plate)}\n` +
        `Jami: ${Number(r.order.total).toLocaleString("ru-RU")} so‘m${debt > 0 ? ` · Nasiya: ${debt.toLocaleString("ru-RU")} so‘m` : " · to‘liq to‘langan"}`,
      openAppKeyboard(r.order.id),
    );
  } catch (e) {
    const text = e instanceof PlanProblem || e instanceof HttpError ? e.message : "Saqlashda xatolik yuz berdi";
    if (!(e instanceof PlanProblem || e instanceof HttpError)) console.error("Draft save failed:", e instanceof Error ? e.message : e);
    await editMessage(chatId, messageId, `❌ ${escapeHtml(text)}`);
  }
}

async function sendWelcome(chatId: number, tgId: number) {
  const user = await prisma.user.findUnique({ where: { telegramId: String(tgId) } });
  const member = user ? await resolveMembership(user.id) : null;
  const text = member
    ? "👋 Assalomu alaykum!\n\n🎙 Servisni <b>ovozli xabar</b> bilan kiritishingiz mumkin. Masalan:\n<i>“01A123BC, Nexia, Malik aka. Moy almashtirish 250 ming, filtr 50 ming. 100 mingini naqd berdi, qolgani 10 kunga nasiya.”</i>\n\nMen hammasini ajratib ko‘rsataman, siz <b>✅ Saqlash</b>ni bosasiz. Matn bilan yozsangiz ham bo‘ladi.\n\nHar kuni ertalab nasiya eslatmalari ham shu yerga keladi."
    : "👋 Assalomu alaykum! Ilovani ochib, ustaxona yarating yoki taklif kodi bilan qo‘shiling.";
  await sendMessage(chatId, text, openAppKeyboard());
}

/**
 * Points the bot's webhook at this server. If the bot already has a webhook
 * somewhere else it is left alone (set TELEGRAM_WEBHOOK_FORCE=true to take it over),
 * so another service using the same bot is never cut off silently.
 */
export async function configureWebhook() {
  const base = (process.env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
  const secret = webhookSecret();
  if (!base || !secret || !process.env.TELEGRAM_BOT_TOKEN) {
    if (process.env.NODE_ENV === "production") console.warn("Bot webhook not configured: set PUBLIC_API_URL.");
    return;
  }
  const url = `${base}/api/telegram/webhook`;
  try {
    const info = await tgCall<{ url?: string }>("getWebhookInfo", {});
    if (info.url && info.url !== url && process.env.TELEGRAM_WEBHOOK_FORCE !== "true") {
      console.warn(`Bot already has another webhook (${new URL(info.url).host}); not replacing it. Set TELEGRAM_WEBHOOK_FORCE=true to switch.`);
      return;
    }
    await tgCall("setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"], max_connections: 10 });
    console.log("Telegram webhook: configured");
  } catch (e) {
    console.error("Telegram webhook setup failed:", e instanceof Error ? e.message : e);
  }
}

/** Removes old drafts so transcripts are not kept longer than needed. */
export async function cleanupDrafts() {
  await prisma.voiceDraft.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86400000) } } }).catch(() => undefined);
}
