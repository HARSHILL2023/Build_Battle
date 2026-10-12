import { Router } from "express";
import {
  createUser,
  deleteUser,
  demoLogin,
  getCsrf,
  getMe,
  listSessions,
  listUsers,
  login,
  logout,
  patchUserRole,
  revokeSession,
} from "../controllers/authController.js";
import { requireAdmin, requireAuth } from "../middleware/requireAuth.js";
import { denyDemoWrites } from "../middleware/demoGuard.js";
import { validateCsrf } from "../middleware/csrf.js";
import { rateLimitRoute } from "../utils/rateLimit.js";

export const authRouter = Router();

// Public: mint the synchronizer token (anonymous session allowed here).
authRouter.get("/csrf", getCsrf);

// Login is rate limited per client and CSRF-guarded even pre-login: the
// token comes from GET /csrf on the anonymous session.
authRouter.post(
  "/login",
  rateLimitRoute("login", 20, (s) => `Too many login attempts. Try again in ${s}s.`),
  validateCsrf,
  login
);

authRouter.post("/logout", requireAuth, validateCsrf, logout);
authRouter.get("/me", requireAuth, getMe);

// Passwordless demo entry ("Try Live Demo"). Stricter per-client rate limit
// than login: each call mints a server-side session, so abuse is capped.
authRouter.post(
  "/demo",
  rateLimitRoute("demo-login", 10, (s) => `Too many demo requests. Try again in ${s}s.`),
  validateCsrf,
  demoLogin
);

authRouter.get("/sessions", requireAuth, listSessions);
authRouter.delete("/sessions/:id", requireAuth, denyDemoWrites, validateCsrf, revokeSession);

authRouter.post("/users", requireAuth, requireAdmin, validateCsrf, createUser);
authRouter.get("/users", requireAuth, requireAdmin, listUsers);
authRouter.patch("/users/:id", requireAuth, requireAdmin, validateCsrf, patchUserRole);
authRouter.delete("/users/:id", requireAuth, requireAdmin, validateCsrf, deleteUser);
