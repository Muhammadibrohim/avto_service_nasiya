import { Router } from "express";
import { prisma } from "./db.js";
import { telegramAuth } from "./middleware/telegramAuth.js";
import { auth, AuthRequest } from "./middleware/auth.js";
import { migrateLegacyAvtoData } from "./legacyMigration.js";

export const router = Router();

router.post("/auth/telegram", telegramAuth, async (req, res) => {
  const tg = req.telegramUser!;
  const telegramId = String(tg.id);
  const name = [tg.first_name, tg.last_name].filter(Boolean).join(" ").trim() || tg.username || "Telegram user";

  const result = await prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { telegramId } });
    if (!user) {
      user = await tx.user.create({ data: { telegramId, name, username: tg.username, role: "owner", status: "active" } });
    } else {
      user = await tx.user.update({ where: { id: user.id }, data: { name, username: tg.username } });
    }

    let workshop = await tx.workshop.findFirst({ where: { ownerUserId: user.id } });
    if (!workshop) {
      workshop = await tx.workshop.create({ data: { name: "AVTO SERVICE NASIYA", ownerUserId: user.id, status: "active" } });
    }
    return { user, workshop };
  });

  try {
    const migration = await migrateLegacyAvtoData();
    console.log("Legacy migration after Telegram auth:", migration);
  } catch (error) {
    console.error("Legacy migration after Telegram auth failed:", error);
  }

  res.json(result);
});

router.get("/me", auth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  const workshop = req.user!.workshopId ? await prisma.workshop.findUnique({ where: { id: req.user!.workshopId } }) : null;
  res.json({ user, workshop });
});

router.get("/customers", auth, async (req: AuthRequest, res) => {
  if (!req.user?.workshopId) return res.json([]);
  const q = String(req.query.q || "").trim();
  const customers = await prisma.customer.findMany({
    where: { workshopId: req.user.workshopId, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}) },
    include: { vehicles: true },
    orderBy: { createdAt: "desc" }
  });
  res.json(customers);
});

router.get("/orders", auth, async (req: AuthRequest, res) => {
  if (!req.user?.workshopId) return res.json([]);
  res.json(await prisma.serviceOrder.findMany({
    where: { workshopId: req.user.workshopId },
    include: { customer: true, vehicle: true, items: true, payments: true },
    orderBy: { createdAt: "desc" }
  }));
});

router.get("/debts", auth, async (req: AuthRequest, res) => {
  if (!req.user?.workshopId) return res.json([]);
  res.json(await prisma.serviceOrder.findMany({
    where: { workshopId: req.user.workshopId, debt: { gt: 0 } },
    include: { customer: true, vehicle: true },
    orderBy: [{ dueDate: "asc" }, { debt: "desc" }]
  }));
});

router.get("/analytics", auth, async (req: AuthRequest, res) => {
  if (!req.user?.workshopId) return res.json({ orders: 0, revenue: 0, paid: 0, debt: 0 });

  let migration: unknown = null;
  const existingCustomers = await prisma.customer.count({ where: { workshopId: req.user.workshopId } });

  // Self-heal: if the workshop is still empty, retry the legacy import on the
  // authenticated Mini App request instead of silently returning all-zero KPIs.
  if (existingCustomers === 0) {
    try {
      migration = await migrateLegacyAvtoData();
    } catch (error) {
      migration = {
        skipped: false,
        error: error instanceof Error ? error.message : "Legacy migration failed"
      };
      console.error("Legacy migration during analytics failed:", error);
    }
  }

  const [orders, aggregate, customers, vehicles] = await Promise.all([
    prisma.serviceOrder.count({ where: { workshopId: req.user.workshopId } }),
    prisma.serviceOrder.aggregate({ where: { workshopId: req.user.workshopId }, _sum: { total: true, paid: true, debt: true } }),
    prisma.customer.count({ where: { workshopId: req.user.workshopId } }),
    prisma.vehicle.count({ where: { workshopId: req.user.workshopId } })
  ]);

  res.json({
    orders,
    revenue: aggregate._sum.total || 0,
    paid: aggregate._sum.paid || 0,
    debt: aggregate._sum.debt || 0,
    customers,
    vehicles,
    migration
  });
});

router.post("/payments", auth, async (req: AuthRequest, res) => {
  const { orderId, amount, method = "cash", note } = req.body;
  const value = Number(amount);
  if (!orderId || !Number.isFinite(value) || value <= 0) return res.status(400).json({ error: "Invalid payment" });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.findFirst({ where: { id: orderId, workshopId: req.user!.workshopId } });
      if (!order) throw new Error("Order not found");
      if (value > Number(order.debt)) throw new Error("Payment exceeds remaining debt");
      const payment = await tx.payment.create({ data: { orderId, customerId: order.customerId, amount: value, method, note } });
      const paid = Number(order.paid) + value;
      const debt = Math.max(0, Number(order.total) - paid);
      const updated = await tx.serviceOrder.update({ where: { id: orderId }, data: { paid, debt, status: debt === 0 ? "completed" : order.status } });
      return { payment, order: updated };
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Payment failed" });
  }
});


router.post("/customers", auth, async (req: AuthRequest, res) => {
  if (!req.user?.workshopId) return res.status(400).json({ error: "Workshop not found" });
  const { name, phone, notes } = req.body;
  if (!String(name || "").trim()) return res.status(400).json({ error: "Name is required" });
  const customer = await prisma.customer.create({ data: { workshopId: req.user.workshopId, name: String(name).trim(), phone: phone ? String(phone).trim() : null, notes } });
  res.status(201).json(customer);
});

router.post("/vehicles", auth, async (req: AuthRequest, res) => {
  if (!req.user?.workshopId) return res.status(400).json({ error: "Workshop not found" });
  const { customerId, make, model, plate, year, color, mileage } = req.body;
  if (!customerId || !make || !plate) return res.status(400).json({ error: "Customer, make and plate are required" });
  const customer = await prisma.customer.findFirst({ where: { id: customerId, workshopId: req.user.workshopId } });
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  const vehicle = await prisma.vehicle.create({ data: { workshopId: req.user.workshopId, customerId, make, model, plate, year: year ? Number(year) : null, color, mileage: mileage ? Number(mileage) : null } });
  res.status(201).json(vehicle);
});

router.get("/services", auth, async (req: AuthRequest, res) => {
  if (!req.user?.workshopId) return res.json([]);
  res.json(await prisma.service.findMany({ where: { workshopId: req.user.workshopId, active: true }, orderBy: { name: "asc" } }));
});

router.get("/parts", auth, async (req: AuthRequest, res) => {
  if (!req.user?.workshopId) return res.json([]);
  res.json(await prisma.part.findMany({ where: { workshopId: req.user.workshopId, active: true }, orderBy: { name: "asc" } }));
});

router.post("/orders", auth, async (req: AuthRequest, res) => {
  if (!req.user?.workshopId) return res.status(400).json({ error: "Workshop not found" });
  const { customerId, vehicleId, items = [], paid = 0, dueDate, note } = req.body;
  if (!customerId || !vehicleId || !Array.isArray(items) || !items.length) return res.status(400).json({ error: "Customer, vehicle and at least one item are required" });
  try {
    const result = await prisma.$transaction(async tx => {
      const customer = await tx.customer.findFirst({ where: { id: customerId, workshopId: req.user!.workshopId } });
      const vehicle = await tx.vehicle.findFirst({ where: { id: vehicleId, workshopId: req.user!.workshopId, customerId } });
      if (!customer || !vehicle) throw new Error("Customer or vehicle not found");
      const normalized = items.map((i:any) => { const quantity=Number(i.quantity||1), unitPrice=Number(i.unitPrice||0); if(!i.name||quantity<=0||unitPrice<0) throw new Error("Invalid order item"); return { name:String(i.name), quantity, unitPrice, total:quantity*unitPrice, serviceId:i.serviceId||null, partId:i.partId||null }; });
      const total = normalized.reduce((s:number,i:any)=>s+i.total,0);
      const initialPaid=Math.min(Math.max(Number(paid||0),0),total);
      const order=await tx.serviceOrder.create({data:{workshopId:req.user!.workshopId!,customerId,vehicleId,createdById:req.user!.id,total,paid:initialPaid,debt:total-initialPaid,dueDate:dueDate?new Date(dueDate):null,note,status:total-initialPaid===0?"completed":"open",items:{create:normalized}}});
      if(initialPaid>0) await tx.payment.create({data:{orderId:order.id,customerId,amount:initialPaid,method:"cash",note:"Boshlang‘ich to‘lov"}});
      return tx.serviceOrder.findUnique({where:{id:order.id},include:{customer:true,vehicle:true,items:true,payments:true}});
    });
    res.status(201).json(result);
  } catch(e) { res.status(400).json({error:e instanceof Error?e.message:"Order creation failed"}); }
});
