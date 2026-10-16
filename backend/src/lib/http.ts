import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const notFound = (message = "Topilmadi") => new HttpError(404, message);
export const forbidden = (message = "Bu amal uchun ruxsat yo‘q") => new HttpError(403, message);
export const conflict = (message: string) => new HttpError(409, message);

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    return res.status(400).json({ error: issue?.message || "Noto‘g‘ri ma’lumot", field: issue?.path.join(".") });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return res.status(404).json({ error: "Topilmadi" });
    if (err.code === "P2002") return res.status(409).json({ error: "Bunday yozuv allaqachon mavjud" });
  }
  if (err instanceof SyntaxError && "body" in (err as object)) {
    return res.status(400).json({ error: "JSON noto‘g‘ri" });
  }
  console.error(err);
  return res.status(500).json({ error: "Serverda xatolik yuz berdi" });
}
