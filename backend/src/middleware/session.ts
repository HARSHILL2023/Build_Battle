import session from "express-session";
import MongoStore from "connect-mongo";
import { frontendOrigins, getEnv } from "../config/env.js";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    csrfToken?: string;
  }
}

export const SESSION_COOKIE_NAME = "insightflow.sid";

// Server-side sessions in MongoDB (dedicated `sessions` collection with a
// TTL index). Never the in-memory store: it leaks across restarts and does
// not survive multiple processes. Opaque ids; nothing sensitive is trusted
// from the client.
export function sessionMiddleware() {
  const env = getEnv();
  const maxAgeMs = env.SESSION_MAX_AGE_HOURS * 3_600_000;
  if (env.COOKIE_SAMESITE === "none" && !env.COOKIE_SECURE) {
    throw new Error("COOKIE_SAMESITE=none requires COOKIE_SECURE=true (browsers reject otherwise).");
  }
  if (env.COOKIE_SAMESITE !== "none" && frontendOrigins().some((o) => o.startsWith("https://"))) {
    // SameSite=lax/strict cookies are never sent on cross-site fetch, so a
    // production frontend on another host would silently lose its session.
    console.warn(
      "[insightflow] HTTPS frontend origin with COOKIE_SAMESITE!=none: browsers will drop the " +
        "session cookie on cross-site API calls. Set COOKIE_SAMESITE=none and COOKIE_SECURE=true."
    );
  }
  return session({
    name: SESSION_COOKIE_NAME,
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: env.COOKIE_SAMESITE,
      path: "/",
      maxAge: maxAgeMs,
    },
    store: MongoStore.create({
      mongoUrl: env.MONGODB_URI,
      collectionName: "sessions",
      ttl: Math.floor(maxAgeMs / 1000),
      autoRemove: "native",
      // Store sessions as objects (not JSON strings) so ownership lookups
      // like {"session.userId": id} work for listing and revocation.
      stringify: false,
    }),
  });
}

export function sessionMaxAgeMs(): number {
  return getEnv().SESSION_MAX_AGE_HOURS * 3_600_000;
}
