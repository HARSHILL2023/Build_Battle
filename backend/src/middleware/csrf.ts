import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { frontendOrigins } from "../config/env.js";

const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Synchronizer CSRF tokens tied to the server-side session. Safe methods
// pass through; every state-changing /api request must present the token
// issued for its session. As a second layer, a present Origin/Referer must
// match the configured frontend origin (never the only defense: absent
// headers from non-browser clients are allowed through to the token check).
export function csrfTokenForSession(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomBytes(32).toString("hex");
  }
  return req.session.csrfToken;
}

function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

function originAllowed(req: Request): boolean {
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  if (!origin && !referer) return true;
  const allowed = frontendOrigins();
  const check = (value: string): boolean => {
    try {
      return allowed.includes(new URL(value).origin);
    } catch {
      return false;
    }
  };
  if (origin && !check(origin)) return false;
  if (referer && !check(referer)) return false;
  return true;
}

export function validateCsrf(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  if (!originAllowed(req)) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }
  const presented = req.headers[CSRF_HEADER];
  const expected = req.session?.csrfToken;
  if (typeof presented !== "string" || !expected || !tokensEqual(presented, expected)) {
    res.status(403).json({ error: "Invalid or missing CSRF token." });
    return;
  }
  next();
}
