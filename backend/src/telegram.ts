import crypto from "node:crypto";

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

function parseInitData(initData: string): URLSearchParams {
  return new URLSearchParams(initData);
}

export function validateTelegramInitData(initData: string, botToken: string, maxAgeSeconds = Number(process.env.TELEGRAM_AUTH_MAX_AGE || 86400)) {
  const params = parseInitData(initData);
  const receivedHash = params.get("hash");

  if (!receivedHash) throw new Error("Telegram initData hash missing");

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Math.floor(Date.now() / 1000) - authDate > maxAgeSeconds) {
    throw new Error("Telegram initData expired");
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (
    calculatedHash.length !== receivedHash.length ||
    !crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(receivedHash))
  ) {
    throw new Error("Telegram initData signature invalid");
  }

  const userRaw = params.get("user");
  if (!userRaw) throw new Error("Telegram user missing");

  return {
    user: JSON.parse(userRaw) as TelegramUser,
    authDate,
    startParam: params.get("start_param") || undefined,
  };
}

const TELEGRAM_API = "https://api.telegram.org";

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function appUrl(): string | undefined {
  return process.env.TELEGRAM_MENU_URL || process.env.FRONTEND_URL?.split(",")[0]?.trim() || undefined;
}

/** Sends an HTML message to a private chat. Returns false instead of throwing. */
export async function sendTelegramMessage(chatId: string, html: string, withAppButton = true): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const url = appUrl();
  const body: Record<string, unknown> = { chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true };
  if (withAppButton && url) {
    body.reply_markup = { inline_keyboard: [[{ text: "🔧 Ilovani ochish", web_app: { url } }]] };
  }
  try {
    const r = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await r.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!data.ok) console.warn("Telegram sendMessage failed:", chatId, data.description);
    return Boolean(data.ok);
  } catch (e) {
    console.warn("Telegram sendMessage error:", e);
    return false;
  }
}

type TgResult<T> = { ok: boolean; result?: T; description?: string };

/** Calls a Bot API method. Throws on failure; the token never appears in the error. */
export async function tgCall<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const r = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data = (await r.json().catch(() => ({}))) as TgResult<T>;
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description ?? r.status}`);
  return data.result as T;
}

export type InlineKeyboard = { text: string; callback_data?: string; web_app?: { url: string } }[][];

export async function sendMessage(chatId: string | number, html: string, keyboard?: InlineKeyboard) {
  return tgCall<{ message_id: number }>("sendMessage", {
    chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true,
    ...(keyboard && { reply_markup: { inline_keyboard: keyboard } }),
  });
}

export async function editMessage(chatId: string | number, messageId: number, html: string, keyboard?: InlineKeyboard) {
  try {
    await tgCall("editMessageText", {
      chat_id: chatId, message_id: messageId, text: html, parse_mode: "HTML", disable_web_page_preview: true,
      reply_markup: { inline_keyboard: keyboard ?? [] },
    });
  } catch (e) {
    // "message is not modified" and similar are harmless
    console.warn(e instanceof Error ? e.message : e);
  }
}

/** Downloads a file the user sent to the bot. Refuses files over `maxBytes`. */
export async function downloadTelegramFile(fileId: string, maxBytes: number): Promise<Buffer> {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const file = await tgCall<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
  if (!file.file_path) throw new Error("Telegram file path missing");
  if (file.file_size && file.file_size > maxBytes) throw new Error("File too large");
  const r = await fetch(`${TELEGRAM_API}/file/bot${token}/${file.file_path}`, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Telegram file download failed: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > maxBytes) throw new Error("File too large");
  return buf;
}

/**
 * Secret Telegram sends in X-Telegram-Bot-Api-Secret-Token with every webhook call.
 * Uses TELEGRAM_WEBHOOK_SECRET if set, otherwise derives a stable one from the bot token.
 */
export function webhookSecret(): string | undefined {
  if (process.env.TELEGRAM_WEBHOOK_SECRET) return process.env.TELEGRAM_WEBHOOK_SECRET;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return undefined;
  return crypto.createHash("sha256").update(`webhook:${token}`).digest("hex").slice(0, 48);
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
