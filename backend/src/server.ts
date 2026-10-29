import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./db.js";
import { router } from "./routes.js";
import { errorHandler } from "./lib/http.js";
import { appUrl } from "./telegram.js";
import { startReminderScheduler } from "./reminders.js";
import { botRouter, cleanupDrafts, configureWebhook } from "./bot/webhook.js";
import { rateLimit } from "./lib/rateLimit.js";
import { DEFAULT_DUE_DAYS, TZ_OFFSET_MIN } from "./lib/time.js";

const app = express();
const port = Number(process.env.PORT || 3000);
/** Allowed browser origins: FRONTEND_URL, falling back to the Mini App URL. Only "*" opens CORS to everyone. */
function corsOrigins(): string[] | true {
  const list = [process.env.FRONTEND_URL, process.env.TELEGRAM_MENU_URL]
    .flatMap((v) => v?.split(",") ?? [])
    .map((v) => v.trim())
    .filter(Boolean);
  if (list.includes("*")) return true;
  const origins = [...new Set(list.map((v) => { try { return new URL(v).origin; } catch { return ""; } }).filter(Boolean))];
  if (origins.length) return origins;
  if (process.env.NODE_ENV === "production") {
    console.error("FRONTEND_URL is not set: browser requests are blocked. Set it to the Mini App address.");
    return [];
  }
  return true; // local development
}
const origins = corsOrigins();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(cors({ origin: origins, allowedHeaders: ["content-type", "x-telegram-init-data", "x-cron-secret"] }));
app.use(express.json({ limit: "200kb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: true, service: "avto-service-nasiya-api" });
  } catch {
    res.status(503).json({ ok: false, db: false, service: "avto-service-nasiya-api" });
  }
});

// Telegram webhook: own secret check, no browser CORS, not counted in the API limit
app.use("/api", botRouter);
app.use("/api", rateLimit(Number(process.env.API_RATE_LIMIT_PER_MIN || 300), 60_000));
app.use("/api", router);
app.use("/api", (_req, res) => res.status(404).json({ error: "Endpoint topilmadi" }));
app.use(errorHandler);

async function configureTelegramMenu() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = appUrl();
  if (!token || !url) return;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ menu_button: { type: "web_app", text: "🔧 AVTO SERVICE", web_app: { url } } }),
    });
    const data = (await r.json()) as { ok?: boolean };
    console.log("Telegram menu button:", data?.ok ? "configured" : "failed");
  } catch (e) {
    console.error("Telegram menu setup failed:", e);
  }
}

/** Old versions stored plates and phones as typed; bring them to the normalized form used for search and display. */
async function normalizeStoredPlates() {
  try {
    const n = await prisma.$executeRaw`
      UPDATE "Vehicle" SET plate = upper(regexp_replace(plate, '[[:space:]_.-]', '', 'g'))
      WHERE plate <> upper(regexp_replace(plate, '[[:space:]_.-]', '', 'g'))`;
    if (n) console.log(`Normalized ${n} vehicle plates`);
    // phones: digits only, local 9-digit numbers get the 998 country code
    const m = await prisma.$executeRaw`
      UPDATE "Customer" SET phone = CASE
          WHEN length(regexp_replace(phone, '[^0-9]', '', 'g')) = 9 THEN '998' || regexp_replace(phone, '[^0-9]', '', 'g')
          ELSE regexp_replace(phone, '[^0-9]', '', 'g') END
      WHERE phone IS NOT NULL AND (phone ~ '[^0-9]' OR length(phone) = 9)`;
    if (m) console.log(`Normalized ${m} customer phones`);
    // debts saved without a due date get DEFAULT_DUE_DAYS from the day the service was created
    const d = await prisma.$executeRaw`
      UPDATE "ServiceOrder"
      SET "dueDate" = date_trunc('day', "createdAt" + make_interval(mins => ${TZ_OFFSET_MIN}::int)) + make_interval(days => ${DEFAULT_DUE_DAYS}::int)
      WHERE "dueDate" IS NULL AND debt > 0 AND status <> 'cancelled'`;
    if (d) console.log(`Set default due date on ${d} debts`);
  } catch (e) {
    console.error("Data normalization failed:", e);
  }
}

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`AVTO SERVICE NASIYA API: http://0.0.0.0:${port}`);
  void normalizeStoredPlates();
  void configureTelegramMenu();
  void configureWebhook();
  void cleanupDrafts();
  setInterval(() => void cleanupDrafts(), 24 * 3600_000).unref();
  startReminderScheduler();
});

const shutdown = () => {
  server.close(() => void prisma.$disconnect().finally(() => process.exit(0)));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
