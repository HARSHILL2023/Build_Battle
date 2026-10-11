/**
 * Minimal in-memory per-client rate limiter for expensive or
 * state-changing endpoints (imports, analysis, deletes, submissions).
 *
 * Scope: single Node process. Behind multiple instances each process
 * tracks its own counters; for this deployment (one server process)
 * that is sufficient. Limits are intentionally generous so normal
 * demo use never trips them; they exist to blunt accidental floods
 * and runaway retries against AI-backed endpoints.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 80);
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.slice(0, 80);
  return "local";
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
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
