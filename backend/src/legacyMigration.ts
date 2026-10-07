import { prisma } from "./db.js";
import legacy from "./data/legacy-avto-db.json" with { type: "json" };

function dateOrNull(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const iso = /^\d{4}-\d{2}-\d{2}T/.test(value) ? value : null;
  if (iso) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return null;
}

function splitMakeModel(value: string) {
  const parts = String(value || "").trim().split(/\s+/);
  return { make: parts.shift() || "Unknown", model: parts.join(" ") || null };
}

function decimal(value: number) {
  return value;
}

export async function migrateLegacyAvtoData() {
  const ownerTelegramId = String(legacy.meta.ownerChatId);
  let owner = await prisma.user.findUnique({ where: { telegramId: ownerTelegramId } });

  if (!owner) {
    owner = await prisma.user.create({
      data: {
        telegramId: ownerTelegramId,
        name: "Xasanboy",
        role: "owner",
        status: "active"
      }
    });
  } else if (owner.role !== "owner") {
    owner = await prisma.user.update({ where: { id: owner.id }, data: { role: "owner" } });
  }

  let workshop = await prisma.workshop.findFirst({ where: { ownerUserId: owner.id } });
  if (!workshop) {
    workshop = await prisma.workshop.create({
      data: { name: "XASANBOY AUTO SERVICE", ownerUserId: owner.id, status: "active" }
    });
  }

  const existingLegacyCustomer = await prisma.customer.findUnique({ where: { id: legacy.CUSTOMERS[0].customer_id } });
  if (existingLegacyCustomer) {
    return { skipped: true, reason: "legacy-data-already-present", workshopId: workshop.id };
  }

  await prisma.$transaction(async (tx) => {
    for (const c of legacy.CUSTOMERS) {
      await tx.customer.create({
        data: {
          id: c.customer_id,
          workshopId: workshop.id,
          name: c.name,
          phone: c.phone,
          createdAt: new Date(c.created_at),
          updatedAt: new Date(c.created_at)
        }
      });
    }

    for (const v of legacy.VEHICLES) {
      const { make, model } = splitMakeModel(v.make_model);
      await tx.vehicle.create({
        data: {
          id: v.vehicle_id,
          workshopId: workshop.id,
          customerId: v.customer_id,
          make,
          model,
          plate: String(v.plate),
          createdAt: new Date(v.created_at),
          updatedAt: new Date(v.created_at)
        }
      });
    }

    for (const s of legacy.SERVICES) {
      await tx.service.create({
        data: {
          id: s.service_id,
          workshopId: workshop.id,
          name: s.name,
          defaultPrice: 0,
          active: s.status === "ACTIVE"
        }
      });
    }

    for (const p of legacy.PARTS) {
      await tx.part.create({
        data: {
          id: p.part_id,
          workshopId: workshop.id,
          name: String(p.name),
          defaultPrice: 0,
          stock: 0,
          active: p.status === "ACTIVE"
        }
      });
    }

    for (const o of legacy.SERVICE_ORDERS) {
      const invalidDueDate = o.due_date === "160000";
      const dueDate = invalidDueDate ? null : dateOrNull(o.due_date);
      const note = invalidDueDate
        ? "Legacy import: original due_date was invalid value 160000 and was preserved in source but not converted to a date."
        : null;

      await tx.serviceOrder.create({
        data: {
          id: o.order_id,
          workshopId: workshop.id,
          customerId: o.customer_id,
          vehicleId: o.vehicle_id,
          createdById: owner.id,
          status: "completed",
          total: decimal(o.total),
          paid: decimal(o.paid),
          debt: decimal(o.debt),
          dueDate,
          note,
          createdAt: new Date(o.created_at),
          updatedAt: new Date(o.created_at)
        }
      });
    }

    for (const i of legacy.ORDER_ITEMS) {
      const service = i.type === "SERVICE"
        ? await tx.service.findFirst({ where: { workshopId: workshop.id, name: i.item_name } })
        : null;
      const part = i.type === "PART"
        ? await tx.part.findFirst({ where: { workshopId: workshop.id, name: String(i.item_name) } })
        : null;

      await tx.orderItem.create({
        data: {
          id: i.item_id,
          orderId: i.order_id,
          serviceId: service?.id ?? null,
          partId: part?.id ?? null,
          name: String(i.item_name),
          quantity: 1,
          unitPrice: decimal(i.amount),
          total: decimal(i.amount)
        }
      });
    }

    for (const p of legacy.PAYMENTS) {
      await tx.payment.create({
        data: {
          id: p.payment_id,
          orderId: p.order_id,
          customerId: p.customer_id,
          amount: decimal(p.amount),
          method: "cash",
          note: "Imported from legacy Google Sheets",
          createdAt: new Date(p.paid_at)
        }
      });
    }

    for (const s of legacy.SETTINGS) {
      await tx.setting.upsert({
        where: { workshopId_key: { workshopId: workshop.id, key: s.key } },
        create: { workshopId: workshop.id, key: s.key, value: String(s.value) },
        update: { value: String(s.value) }
      });
    }
  });

  return {
    skipped: false,
    workshopId: workshop.id,
    customers: legacy.CUSTOMERS.length,
    vehicles: legacy.VEHICLES.length,
    orders: legacy.SERVICE_ORDERS.length,
    items: legacy.ORDER_ITEMS.length,
    payments: legacy.PAYMENTS.length,
    services: legacy.SERVICES.length,
    parts: legacy.PARTS.length
  };
}
