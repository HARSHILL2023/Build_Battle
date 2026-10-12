import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { User, USER_ROLES, type UserRole } from "../models/User.js";
import {
  emailSchema,
  hashPassword,
  normalizeEmail,
  passwordSchema,
  verifyPassword,
} from "../services/passwordService.js";
import { getEnv } from "../config/env.js";
import { csrfTokenForSession } from "../middleware/csrf.js";

const GENERIC_LOGIN_ERROR = "Invalid email or password.";
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60_000;

const loginSchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(256),
});

const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(USER_ROLES).default("user"),
});

const updateRoleSchema = z.object({ role: z.enum(USER_ROLES) });

function publicUser(user: { _id: unknown; email: string; role: string; isDemo?: boolean }) {
  return { id: String(user._id), email: user.email, role: user.role, isDemo: user.isDemo === true };
}

// The shared read-only demo account behind "Try Live Demo". One document for
// every visitor; each visitor still gets their own server-side session, so
// concurrent judges never share cookies or CSRF tokens. Read-only writes
// are denied by denyDemoWrites, so sharing the account cannot corrupt data.
const DEMO_EMAIL = "demo@insightflow.local";

function regenerate(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function destroy(req: Request, res: Response): Promise<void> {
  const env = getEnv();
  return new Promise((resolve) => {
    req.session.destroy(() => {
      // Clearing must repeat the cookie attributes, otherwise browsers keep
      // a SameSite=None; Secure cookie and the user stays logged in.
      res.clearCookie("insightflow.sid", {
        path: "/",
        sameSite: env.COOKIE_SAMESITE,
        secure: env.COOKIE_SECURE,
      });
      resolve();
    });
  });
}

interface SessionDoc {
  _id: string;
  session?: { userId?: string; csrfToken?: string };
  expires?: Date;
}

function sessionsCollection() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected.");
  return db.collection<SessionDoc>("sessions");
}

export async function revokeUserSessions(userId: string): Promise<number> {
  const result = await sessionsCollection().deleteMany({ "session.userId": userId });
  return result.deletedCount ?? 0;
}

// POST /api/auth/login — rotates the session, then issues a fresh CSRF
// token bound to it. Errors are generic: they never reveal whether the
// account exists, is locked, or which field was wrong.
export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    return;
  }
  const email = normalizeEmail(parsed.data.email);
  const user = await User.findOne({ email }).select("+passwordHash").lean();
  if (user?.lockUntil && user.lockUntil.getTime() > Date.now()) {
    res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    return;
  }
  // The demo account is only reachable through POST /api/auth/demo (strictly
  // rate limited). Password login into it is rejected with the same generic
  // error, so leaked or guessed demo credentials buy nothing.
  if (user?.isDemo) {
    res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    return;
  }
  const ok = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !ok) {
    if (user) {
      const failedAttempts = (user.failedAttempts ?? 0) + 1;
      await User.updateOne(
        { _id: user._id },
        failedAttempts >= MAX_FAILED_ATTEMPTS
          ? { $set: { failedAttempts, lockUntil: new Date(Date.now() + LOCK_MS) } }
          : { $set: { failedAttempts } }
      );
    }
    res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    return;
  }
  await User.updateOne({ _id: user._id }, { $set: { failedAttempts: 0, lockUntil: null } });
  await regenerate(req);
  req.session.userId = String(user._id);
  const csrfToken = csrfTokenForSession(req);
  res.json({ user: publicUser(user), csrfToken });
}

// POST /api/auth/logout — destroys the server-side session and clears the
// cookie. Requires the session CSRF token (logout CSRF is real).
export async function logout(req: Request, res: Response): Promise<void> {
  await destroy(req, res);
  res.json({ message: "Logged out." });
}

// POST /api/auth/demo — passwordless entry for "Try Live Demo". Provisions
// the shared read-only demo account on first use (unguessable random
// password, role user, isDemo), then mints a short-lived session exactly
// like a normal login. Strictly rate limited at the route; believed-abuse
// switch is DEMO_ENABLED=false. Errors stay generic on conflicts.
export async function demoLogin(req: Request, res: Response): Promise<void> {
  if (!getEnv().DEMO_ENABLED) {
    res.status(403).json({ error: "Demo access is disabled." });
    return;
  }
  let demo = await User.findOne({ email: DEMO_EMAIL, isDemo: true }).lean();
  if (!demo) {
    try {
      demo = await User.create({
        email: DEMO_EMAIL,
        passwordHash: await hashPassword(randomBytes(48).toString("hex")),
        role: "user",
        isDemo: true,
      }).then((d) => d.toObject());
    } catch {
      // Lost a creation race, or a non-demo account owns the address: retry
      // the lookup once and fail closed if it is still not a demo account.
      demo = await User.findOne({ email: DEMO_EMAIL, isDemo: true }).lean();
      if (!demo) {
        res.status(503).json({ error: "Demo access is temporarily unavailable. Try again." });
        return;
      }
    }
  }
  if (demo.role !== "user") {
    res.status(503).json({ error: "Demo access is temporarily unavailable. Try again." });
    return;
  }
  await regenerate(req);
  req.session.userId = String(demo._id);
  req.session.cookie.maxAge = Math.floor(getEnv().DEMO_SESSION_HOURS * 3_600_000);
  const csrfToken = csrfTokenForSession(req);
  res.json({ user: publicUser(demo), csrfToken });
}

// GET /api/auth/csrf — mints (or reuses) the synchronizer token for this
// session, including anonymous pre-login sessions.
export function getCsrf(req: Request, res: Response): void {
  res.json({ csrfToken: csrfTokenForSession(req) });
}

// GET /api/auth/me — session status probe for the frontend shell.
export function getMe(req: Request, res: Response): void {
  res.json({ user: req.user });
}

// POST /api/auth/users (admin) — the only account creation path. There is
// no public self-registration; role comes from the validated body, never
// from an unprivileged caller.
export async function createUser(req: Request, res: Response): Promise<void> {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request body." });
    return;
  }
  const email = normalizeEmail(parsed.data.email);
  const existing = await User.findOne({ email }).select("_id").lean();
  if (existing) {
    res.status(409).json({ error: "An account with that email already exists." });
    return;
  }
  const created = await User.create({
    email,
    passwordHash: await hashPassword(parsed.data.password),
    role: parsed.data.role as UserRole,
  });
  res.status(201).json({ user: publicUser(created) });
}

export async function listUsers(_req: Request, res: Response): Promise<void> {
  const users = await User.find().select("_id email role createdAt").sort({ email: 1 }).lean();
  res.json({ users: users.map(publicUser) });
}

// PATCH /api/auth/users/:id (admin) — role changes rotate security posture:
// the target's sessions are revoked so a demotion takes effect immediately.
export async function patchUserRole(req: Request, res: Response): Promise<void> {
  const parsed = updateRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request body." });
    return;
  }
  const userId = req.params.id ?? "";
  if (!mongoose.isValidObjectId(userId)) {
    res.status(400).json({ error: "Invalid user id." });
    return;
  }
  const target = await User.findById(userId).select("_id email role isDemo").lean();
  if (!target) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  if (String(target._id) === req.user?.id) {
    res.status(400).json({ error: "You cannot change your own role." });
    return;
  }
  if (target.isDemo) {
    res.status(400).json({ error: "The demo account always stays read-only." });
    return;
  }
  await User.updateOne({ _id: target._id }, { $set: { role: parsed.data.role } });
  await revokeUserSessions(String(target._id));
  res.json({ user: { ...publicUser(target), role: parsed.data.role } });
}

// DELETE /api/auth/users/:id (admin) — never self, never the last admin.
export async function deleteUser(req: Request, res: Response): Promise<void> {
  const userId = req.params.id ?? "";
  if (!mongoose.isValidObjectId(userId)) {
    res.status(400).json({ error: "Invalid user id." });
    return;
  }
  const target = await User.findById(userId).select("_id email role").lean();
  if (!target) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  if (String(target._id) === req.user?.id) {
    res.status(400).json({ error: "You cannot delete your own account." });
    return;
  }
  if (target.role === "admin") {
    const adminCount = await User.countDocuments({ role: "admin" });
    if (adminCount <= 1) {
      res.status(400).json({ error: "You cannot delete the last administrator." });
      return;
    }
  }
  await User.deleteOne({ _id: target._id });
  await revokeUserSessions(String(target._id));
  res.json({ message: "User deleted." });
}

// GET /api/auth/sessions — the caller's own live sessions. Ids are only
// ever shown to their owner (or an administrator); revocation re-checks
// ownership server-side.
export async function listSessions(req: Request, res: Response): Promise<void> {
  const docs = await sessionsCollection()
    .find({ "session.userId": req.user?.id })
    .project({ expires: 1 })
    .toArray();
  res.json({
    sessions: docs.map((d) => ({
      id: String(d._id),
      current: String(d._id) === req.sessionID,
      expiresAt: d.expires ?? null,
    })),
  });
}

// DELETE /api/auth/sessions/:id — revoke one session: your own, or anyone's
// as an administrator.
export async function revokeSession(req: Request, res: Response): Promise<void> {
  const targetId = String(req.params.id ?? "");
  if (!targetId) {
    res.status(400).json({ error: "Invalid session id." });
    return;
  }
  const doc = await sessionsCollection().findOne({ _id: targetId });
  if (!doc) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  const ownerId = doc.session?.userId;
  if (ownerId !== req.user?.id && req.user?.role !== "admin") {
    res.status(403).json({ error: "Forbidden." });
    return;
  }
  await sessionsCollection().deleteOne({ _id: targetId });
  res.json({ message: "Session revoked." });
}
