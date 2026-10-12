import type { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

export function clientKeyFromReq(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim().slice(0, 80);
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.length > 0) return realIp.slice(0, 80);
  return (req.ip ?? "local").slice(0, 80);
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/** Periodically drop expired buckets so the map cannot grow unbounded. */
let swept = 0;
export function sweepBuckets(): void {
  const now = Date.now();
  if (now - swept < 60_000) return;
  swept = now;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

/** Test-only isolation: clears in-memory buckets between scenarios.
 * Production never calls this; the limiter itself is still fully exercised. */
export function resetRateLimitBuckets(): void {
  buckets.clear();
}

export function rateLimitRoute(
  keyPrefix: string,
  limit: number,
  message: (retryAfterSec: number) => string
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    sweepBuckets();
    const rl = checkRateLimit(`${keyPrefix}:${clientKeyFromReq(req)}`, limit, 60_000);
    if (!rl.ok) {
      res.set("Retry-After", String(rl.retryAfterSec));
      res.status(429).json({ error: message(rl.retryAfterSec) });
      return;
    }
    next();
  };
}
