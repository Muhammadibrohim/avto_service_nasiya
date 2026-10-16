import { Router } from "express";
import { auth, requireWorkshop } from "./middleware/auth.js";
import { sessionRouter } from "./routes/session.js";
import { workshopRouter } from "./routes/workshop.js";
import { customersRouter } from "./routes/customers.js";
import { ordersRouter } from "./routes/orders.js";
import { paymentsRouter } from "./routes/payments.js";
import { catalogRouter } from "./routes/catalog.js";
import { reportsRouter } from "./routes/reports.js";
import { runAllReminders } from "./reminders.js";

export const router = Router();

// Public cron hook (e.g. cron-job.org) — protected by CRON_SECRET.
router.post("/cron/reminders", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.header("x-cron-secret") !== secret) return res.status(401).json({ error: "Unauthorized" });
  res.json(await runAllReminders());
});

router.use(sessionRouter);

const app = Router();
app.use(auth, requireWorkshop);
app.use(workshopRouter, customersRouter, ordersRouter, paymentsRouter, catalogRouter, reportsRouter);
router.use(app);
