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

export function validateTelegramInitData(initData: string, botToken: string, maxAgeSeconds = 86400) {
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
  };
}
