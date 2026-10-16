import type { Method, Money, OrderStatus } from "./types";

const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export const money = (v: Money | null | undefined) => nf.format(Number(v || 0)).replace(/ /g, " ");
export const som = (v: Money | null | undefined) => `${money(v)} so‘m`;

export function date(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export function dateTime(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return `${date(v)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export const phone = (v?: string | null) => {
  if (!v) return "—";
  const digits = v.replace(/\D/g, "");
  const m = /^998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(digits.length === 9 ? `998${digits}` : digits);
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : v;
};

export const METHODS: { id: Method; label: string; icon: string }[] = [
  { id: "cash", label: "Naqd", icon: "○" },
  { id: "card", label: "Karta", icon: "▱" },
  { id: "transfer", label: "O‘tkazma", icon: "↗" },
];
export const methodLabel = (m: Method) => METHODS.find((x) => x.id === m)?.label ?? "Boshqa";

export const STATUS: Record<OrderStatus, string> = {
  open: "Ochiq",
  in_progress: "Jarayonda",
  completed: "Yopilgan",
  cancelled: "Bekor qilingan",
};

/** Whole days from today until `v` (negative = overdue). */
export function daysUntil(v: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(v); due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

export function dueLabel(v?: string | null) {
  if (!v) return "Muddat belgilanmagan";
  const d = daysUntil(v);
  if (d < 0) return `⚠️ ${-d} kun kechikdi`;
  if (d === 0) return "⚠️ Bugun to‘lash kerak";
  return `📅 ${date(v)} gacha`;
}

/** YYYY-MM-DD in local time. */
export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const vehicleName = (v?: { make: string; model: string | null } | null) => (v ? `${v.make} ${v.model ?? ""}`.trim() : "Avtomobil");
