import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./db.js";
import { router } from "./routes.js";
import { errorHandler } from "./lib/http.js";
import { appUrl } from "./telegram.js";
import { startReminderScheduler } from "./reminders.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const origins = process.env.FRONTEND_URL?.split(",").map((v) => v.trim()).filter(Boolean);

if (!origins?.length && process.env.NODE_ENV === "production") {
  console.warn("FRONTEND_URL is not set: CORS allows every origin.");
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(cors({ origin: origins?.length ? origins : true, allowedHeaders: ["content-type", "x-telegram-init-data", "x-cron-secret"] }));
app.use(express.json({ limit: "200kb" }));

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: true, service: "avto-service-nasiya-api" });
  } catch {
    res.status(503).json({ ok: false, db: false, service: "avto-service-nasiya-api" });
  }
});

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

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`AVTO SERVICE NASIYA API: http://0.0.0.0:${port}`);
  void configureTelegramMenu();
  startReminderScheduler();
});

const shutdown = () => {
  server.close(() => void prisma.$disconnect().finally(() => process.exit(0)));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
