import type { NextFunction, Request, Response } from "express";
import { User, type UserRole } from "../models/User.js";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  isDemo: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Session gate: every private route runs this. The session id is opaque;
// the user (and role) is loaded server-side on each request, so deleted
// users, expired sessions, and revoked sessions are all rejected here.
// Role is never taken from the client.
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required. Please log in." });
      return;
    }
    const user = await User.findById(userId).select("_id email role isDemo").lean();
    if (!user) {
      req.session.destroy(() => undefined);
      res.status(401).json({ error: "Authentication required. Please log in." });
      return;
    }
    req.user = { id: String(user._id), email: user.email, role: user.role as UserRole, isDemo: user.isDemo === true };
    next();
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Forbidden. Administrator access required." });
    return;
  }
  next();
}
