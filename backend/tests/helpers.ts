import { MongoMemoryServer } from "mongodb-memory-server";
import type { Express } from "express";
import request from "supertest";
import { connectDb, disconnectDb } from "../src/config/db";
import { User, type UserRole } from "../src/models/User";
import { hashPassword } from "../src/services/passwordService";

export interface TestContext {
  app: Express;
  mongod: MongoMemoryServer;
}

export const TEST_PASSWORD = "correct horse battery staple";

export async function startTestApp(): Promise<TestContext> {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGODB_URI = uri;
  // Respect pre-set values so suites can boot the app under production-like
  // cookie settings (e.g. COOKIE_SAMESITE=none + COOKIE_SECURE=true).
  process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef-test-only";
  process.env.COOKIE_SECURE ??= "false";
  await connectDb(uri);
  const mod = await import("../src/server");
  const app = (mod.app ?? mod.default) as Express;
  return { app, mongod };
}

export async function stopTestApp(ctx: TestContext): Promise<void> {
  await disconnectDb();
  await ctx.mongod.stop();
}

export async function createTestUser(
  email: string,
  role: UserRole = "admin",
  password = TEST_PASSWORD
) {
  return User.create({ email: email.toLowerCase(), passwordHash: await hashPassword(password), role });
}

export interface AuthedClient {
  agent: ReturnType<typeof request.agent>;
  csrfToken: string;
  userId: string;
  withCsrf: (req: request.Test) => request.Test;
}

// Log in through the real login endpoint (CSRF token included), so tests
// exercise the production authentication path instead of stubbing it.
export async function loginAgent(
  app: Express,
  email: string,
  password = TEST_PASSWORD
): Promise<AuthedClient> {
  const agent = request.agent(app);
  const csrfRes = await agent.get("/api/auth/csrf");
  if (csrfRes.status !== 200) throw new Error(`csrf setup failed: ${csrfRes.status}`);
  const anonCsrf = (csrfRes.body as { csrfToken: string }).csrfToken;
  const loginRes = await agent
    .post("/api/auth/login")
    .set("x-csrf-token", anonCsrf)
    .send({ email, password });
  if (loginRes.status !== 200) {
    throw new Error(`login failed for ${email}: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
  }
  const body = loginRes.body as { csrfToken: string; user: { id: string } };
  const csrfToken = body.csrfToken;
  return {
    agent,
    csrfToken,
    userId: body.user.id,
    withCsrf: (req: request.Test) => req.set("x-csrf-token", csrfToken),
  };
}
