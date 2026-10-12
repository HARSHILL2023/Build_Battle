import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { frontendOrigins } from "./config/env.js";
import { connectDb } from "./config/db.js";
import { sessionMiddleware } from "./middleware/session.js";
import { requireAdmin, requireAuth } from "./middleware/requireAuth.js";
import { denyDemoWrites } from "./middleware/demoGuard.js";
import { validateCsrf } from "./middleware/csrf.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { metricsRouter } from "./routes/metrics.js";
import { feedbackRouter } from "./routes/feedback.js";
import { importRouter } from "./routes/imports.js";
import { analyzeRouter } from "./routes/analyze.js";
import { issuesRouter } from "./routes/issues.js";
import { reportsRouter } from "./routes/reports.js";
import { adaptionRouter } from "./routes/adaption.js";
import { dataRouter } from "./routes/data.js";

export const app = express();

app.set("trust proxy", 1);
app.set("query parser", "extended");
app.disable("x-powered-by");

const origins = frontendOrigins();

// Baseline hardening, then exact documented headers below.
app.use(helmet({ contentSecurityPolicy: false }));

// Mirrors the Next.js CSP, extended with connect-src entries for the
// Vite frontend origin(s) so the browser UI can call this API.
app.use((_req, res, next) => {
  const connectSrc = ["'self'", ...origins].join(" ");
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data:`,
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  res.set("Content-Security-Policy", csp);
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "SAMEORIGIN");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (origins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    // Cookie-based sessions: credentials on, wildcard origins never.
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

// Server-managed sessions (MongoDB store). Auth endpoints carry their own
// guards; everything below /api/health requires a valid session, and every
// state-changing request additionally requires its session CSRF token.
app.use(sessionMiddleware());

app.use("/api/auth", authRouter);
app.use("/api/health", healthRouter);

app.use("/api", requireAuth);
app.use("/api", validateCsrf);
// Demo sessions stay read-only: safe methods pass, every other mutation is
// rejected server-side regardless of what the UI shows.
app.use("/api", denyDemoWrites);

app.use("/api/metrics", metricsRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/import", importRouter);
app.use("/api/analyze", analyzeRouter);
app.use("/api/issues", issuesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/adaption", adaptionRouter);
// Destructive workspace operations are administrator-only, on top of the
// typed confirmation and rate limits in the controller.
app.use("/api/data", requireAdmin, dataRouter);

app.use("/api", notFoundHandler);
app.use(errorHandler);

const isTest = process.env.NODE_ENV === "test";

if (!isTest) {
  const port = Number(process.env.PORT?.trim() || "5000");
  connectDb().catch((err) => {
    console.error(
      "[insightflow] database connection failed; serving without storage until it recovers:",
      err instanceof Error ? err.message : String(err)
    );
  });
  app.listen(port, () => {
    console.log(`[insightflow] backend listening on :${port}`);
  });
}

export default app;
