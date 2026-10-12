import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Read-only demo guard ("Try Live Demo"). Demo sessions may read and may log
// out (handled inside the auth router, before this global gate), but every
// other state-changing request is rejected here — enforced server-side, so
// hiding buttons in the UI is only a courtesy. Safe methods always pass.
export function denyDemoWrites(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.isDemo) {
    next();
    return;
  }
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  res.status(403).json({ error: "Demo accounts are read-only. Log in with a full account to make changes." });
}
