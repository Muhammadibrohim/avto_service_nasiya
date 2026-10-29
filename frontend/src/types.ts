export type Role = "owner" | "admin" | "staff";
export type Method = "cash" | "card" | "transfer" | "other";
export type OrderStatus = "open" | "in_progress" | "completed" | "cancelled";
/** Prisma Decimal values arrive as strings. */
export type Money = string | number;

export type Settings = { reminderEnabled: boolean; reminderDays: number };

export type Session = {
  user: { id: string; name: string | null; username: string | null };
  role: Role | null;
  workshop: { id: string; name: string; phone: string | null; address: string | null; inviteCode?: string | null } | null;
  settings: Settings | null;
  needsOnboarding: boolean;
};

export type Vehicle = {
  id: string; customerId: string; make: string; model: string | null; plate: string;
  year: number | null; color: string | null; vin: string | null; mileage: number | null; notes: string | null;
};

export type Customer = {
  id: string; name: string; phone: string | null; notes: string | null; createdAt: string;
  vehicles: Vehicle[]; debt?: number;
};

export type OrderItem = { id: string; name: string; quantity: Money; unitPrice: Money; total: Money; serviceId: string | null; partId: string | null };

export type Payment = {
  id: string; orderId: string; customerId: string; amount: Money; method: Method; note: string | null; createdAt: string;
  createdBy?: { id: string; name: string | null } | null;
  customer?: Customer; order?: Order;
};

export type Order = {
  id: string; customerId: string; vehicleId: string; status: OrderStatus;
  total: Money; paid: Money; debt: Money; dueDate: string | null; mileage: number | null; note: string | null;
  cancelNote: string | null; createdAt: string;
  customer?: Customer; vehicle?: Vehicle; items?: OrderItem[]; payments?: Payment[];
  createdBy?: { id: string; name: string | null } | null;
};

export type CustomerDetail = Customer & { orders: Order[]; summary: { total: number; paid: number; debt: number } };

export type CatalogItem = { id: string; name: string; defaultPrice: Money; stock?: Money; active: boolean };

export type Dashboard = {
  orders: number; revenue: number; paid: number; debt: number; customers: number; debtors: number;
  overdueCount: number; overdueAmount: number; todayPaid: number; monthPaid: number; monthRevenue: number; monthOrders: number;
  reminderDays: number; reminders: Order[];
};

export type Report = {
  from: string; to: string; orders: number; revenue: number; collected: number; newDebt: number; averageCheck: number;
  byMethod: Record<Method, number>;
  daily: { date: string; revenue: number; collected: number; orders: number }[];
  topItems: { name: string; count: number; total: number }[];
  topDebtors: { customerId: string; name: string; phone: string | null; debt: number }[];
};

export type Member = { id: string; role: Role; user: { id: string; name: string | null; username: string | null } };

export type Page<T> = { items: T[]; nextCursor: string | null };

export type AuditEntry = { id: string; action: string; label: string; entity: string; entityId: string | null; details: string | null; userName: string | null; createdAt: string };
