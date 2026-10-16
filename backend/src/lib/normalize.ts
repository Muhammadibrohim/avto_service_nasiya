/** Keeps only digits; turns local 9-digit Uzbek numbers into 998XXXXXXXXX. */
export function normalizePhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 9) return `998${digits}`;
  return digits;
}

/** "01 a 123 bc" -> "01A123BC". Plates are compared and searched in this form. */
export function normalizePlate(value: unknown): string {
  return String(value ?? "").toUpperCase().replace(/[\s\-_.]/g, "");
}

export function cleanText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}
