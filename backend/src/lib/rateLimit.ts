import type { NextFunction, Request, Response } from "express";

/**
 * Small in-memory sliding-window limiter. Good enough for one server instance;
 * counters reset on restart, which is acceptable for abuse/cost protection.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private limit: number, private windowMs: number) {}

  /** Returns true if the call is allowed and records it. */
  take(key: string, now = Date.now()): boolean {
    const from = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > from);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10000) this.prune(now);
    return true;
  }

  private prune(now: number) {
    const from = now - this.windowMs;
    for (const [k, v] of this.hits) if (!v.some((t) => t > from)) this.hits.delete(k);
  }
}

/** Express middleware: limits requests per client IP. */
export function rateLimit(limit: number, windowMs: number) {
  const limiter = new RateLimiter(limit, windowMs);
  return (req: Request, res: Response, next: NextFunction) => {
    if (limiter.take(req.ip ?? "unknown")) return next();
    res.setHeader("Retry-After", String(Math.ceil(windowMs / 1000)));
    res.status(429).json({ error: "Juda ko‘p so‘rov. Birozdan keyin qayta urinib ko‘ring" });
  };
}
