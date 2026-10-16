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
