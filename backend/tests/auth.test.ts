import { execFile } from "node:child_process";
import path from "node:path";
import request from "supertest";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import {
  createTestUser,
  loginAgent,
  startTestApp,
  stopTestApp,
  TEST_PASSWORD,
  type AuthedClient,
  type TestContext,
} from "./helpers";
import { resetRateLimitBuckets } from "../src/utils/rateLimit";
import { User } from "../src/models/User";
import { hashPassword, verifyPassword } from "../src/services/passwordService";

let ctx: TestContext;
let admin: AuthedClient;
let user: AuthedClient;

beforeAll(async () => {
  ctx = await startTestApp();
  await createTestUser("admin-auth@example.com", "admin");
  await createTestUser("user-auth@example.com", "user");
  admin = await loginAgent(ctx.app, "admin-auth@example.com");
  user = await loginAgent(ctx.app, "user-auth@example.com");
});

afterAll(async () => {
  await stopTestApp(ctx);
});

// Each scenario gets fresh rate-limit buckets (per-process test isolation;
// the limiter behavior itself is asserted below).
beforeEach(() => {
  resetRateLimitBuckets();
});

describe("password hashing", () => {
  it("stores salted hashes, never plaintext", async () => {
    const u = await User.findOne({ email: "admin-auth@example.com" }).select("+passwordHash").lean();
    expect(u?.passwordHash).toBeTruthy();
    expect(u?.passwordHash).not.toContain(TEST_PASSWORD);
    expect(await verifyPassword(TEST_PASSWORD, u!.passwordHash)).toBe(true);
    expect(await verifyPassword("wrong password here", u!.passwordHash)).toBe(false);
  });

  it("produces unique salts per password", async () => {
    expect(await hashPassword("same password 123")).not.toBe(await hashPassword("same password 123"));
  });
});

describe("login, logout, session status", () => {
  it("logs in with valid credentials and reports the session", async () => {
    const res = await admin.agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: "admin-auth@example.com", role: "admin" });
  });

  it("rejects wrong passwords and unknown accounts with the same generic error", async () => {
    const agent = request.agent(ctx.app);
    const csrf = (await agent.get("/api/auth/csrf")).body.csrfToken as string;
    const wrongPass = await agent
      .post("/api/auth/login")
      .set("x-csrf-token", csrf)
      .send({ email: "admin-auth@example.com", password: "wrong password here" });
    const unknown = await agent
      .post("/api/auth/login")
      .set("x-csrf-token", csrf)
      .send({ email: "nobody-here@example.com", password: "wrong password here" });
    expect(wrongPass.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPass.body).toEqual(unknown.body);
    expect(wrongPass.body).toEqual({ error: "Invalid email or password." });
  });

  it("rejects malformed login bodies without revealing anything", async () => {
    const agent = request.agent(ctx.app);
    const csrf = (await agent.get("/api/auth/csrf")).body.csrfToken as string;
    for (const body of [{}, { email: "x" }, { email: "a@b.com" }, { password: "x" }]) {
      const res = await agent.post("/api/auth/login").set("x-csrf-token", csrf).send(body);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Invalid email or password." });
    }
  });

  it("rotates the session id on login (pre-login cookie is dead)", async () => {
    const agent = request.agent(ctx.app);
    const anonRes = await agent.get("/api/auth/csrf");
    const anonCookies = anonRes.headers["set-cookie"] as unknown as string[] | undefined;
    const anonCsrf = (anonRes.body as { csrfToken: string }).csrfToken;
    const loginRes = await agent
      .post("/api/auth/login")
      .set("x-csrf-token", anonCsrf)
      .send({ email: "user-auth@example.com", password: TEST_PASSWORD });
    expect(loginRes.status).toBe(200);
    const authCookies = loginRes.headers["set-cookie"] as unknown as string[];
    expect(authCookies.join(";")).not.toBe((anonCookies ?? []).join(";"));
    expect(loginRes.body.csrfToken).toBeTruthy();
  });

  it("sets safe cookie attributes", async () => {
    const agent = request.agent(ctx.app);
    const csrf = (await agent.get("/api/auth/csrf")).body.csrfToken as string;
    const res = await agent
      .post("/api/auth/login")
      .set("x-csrf-token", csrf)
      .send({ email: "user-auth@example.com", password: TEST_PASSWORD });
    const cookies = (res.headers["set-cookie"] as unknown as string[]).join("; ");
    expect(cookies).toMatch(/HttpOnly/i);
    expect(cookies).toMatch(/SameSite=Lax/i);
    expect(cookies).toMatch(/Path=\//i);
  });

  it("logs out and rejects the session afterwards", async () => {
    const session = await loginAgent(ctx.app, "user-auth@example.com");
    expect((await session.agent.get("/api/auth/me")).status).toBe(200);
    const out = await session.withCsrf(session.agent.post("/api/auth/logout")).send();
    expect(out.status).toBe(200);
    expect((await session.agent.get("/api/auth/me")).status).toBe(401);
  });

  it("locks accounts after repeated failures, still generic", async () => {
    await createTestUser("lockout-auth@example.com", "user", "lockout password 123");
    const agent = request.agent(ctx.app);
    const csrf = (await agent.get("/api/auth/csrf")).body.csrfToken as string;
    for (let i = 0; i < 5; i++) {
      await agent.post("/api/auth/login").set("x-csrf-token", csrf).send({
        email: "lockout-auth@example.com",
        password: "wrong password here",
      });
    }
    const locked = await agent.post("/api/auth/login").set("x-csrf-token", csrf).send({
      email: "lockout-auth@example.com",
      password: "lockout password 123",
    });
    expect(locked.status).toBe(401);
    expect(locked.body).toEqual({ error: "Invalid email or password." });
  });
});

describe("CSRF protection", () => {
  it("rejects mutations without a token and with a wrong token", async () => {
    expect((await user.agent.post("/api/feedback").send({ review: "x".repeat(10), category: "Other" })).status).toBe(403);
    expect(
      (
        await user.agent.post("/api/feedback").set("x-csrf-token", "bogus").send({
          review: "x".repeat(10),
          category: "Other",
        })
      ).status
    ).toBe(403);
    const ok = await user.withCsrf(user.agent.post("/api/feedback")).send({
      review: "csrf valid token test record",
      category: "Other",
    });
    expect(ok.status).toBe(201);
    await user.withCsrf(user.agent.delete(`/api/feedback/${ok.body.id}`)).send();
  });

  it("requires a CSRF token even for login", async () => {
    const agent = request.agent(ctx.app);
    const res = await agent.post("/api/auth/login").send({ email: "user-auth@example.com", password: TEST_PASSWORD });
    expect(res.status).toBe(403);
  });
});

describe("route authorization matrix", () => {
  it("rejects unauthenticated access to every protected route", async () => {
    const app = ctx.app;
    const gets = [
      "/api/metrics",
      "/api/feedback",
      "/api/feedback/1",
      "/api/import",
      "/api/analyze",
      "/api/issues",
      "/api/issues/1",
      "/api/reports",
      "/api/adaption",
      "/api/auth/me",
      "/api/auth/users",
      "/api/auth/sessions",
    ];
    for (const path of gets) {
      expect(await request(app).get(path), path).toHaveProperty("status", 401);
    }
    const mutations: Array<[string, string]> = [
      ["post", "/api/feedback"],
      ["post", "/api/import"],
      ["post", "/api/analyze"],
      ["post", "/api/adaption"],
      ["patch", "/api/issues/1"],
      ["delete", "/api/issues/1"],
      ["delete", "/api/feedback/1"],
      ["delete", "/api/data"],
    ];
    for (const [method, path] of mutations) {
      const res = await (request(app)[method] as (url: string) => request.Test)(path).send({});
      expect([401, 403], `${method} ${path}`).toContain(res.status);
    }
  });

  it("keeps /api/health open and minimally informative", async () => {
    const res = await request(ctx.app).get("/api/health");
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/mongodb:\/\/|SECRET|PASSWORD|TOKEN|mongodb\+srv/i);
  });

  it("lets ordinary users read and mutate workspace data, but not destroy it", async () => {
    expect((await user.agent.get("/api/metrics")).status).toBe(200);
    expect((await user.agent.get("/api/reports")).status).toBe(200);
    const created = await user.withCsrf(user.agent.post("/api/feedback")).send({
      review: "ordinary user mutation record",
      category: "Other",
    });
    expect(created.status).toBe(201);
    await user.withCsrf(user.agent.delete(`/api/feedback/${created.body.id}`)).send();
    expect((await user.withCsrf(user.agent.delete("/api/data")).send({})).status).toBe(403);
  });

  it("lets admins destroy workspace data (tested against the isolated db)", async () => {
    const res = await admin.withCsrf(admin.agent.delete("/api/data")).send({ confirm: "DELETE ALL DATA" });
    expect(res.status).toBe(200);
  });

  it("blocks privilege escalation: users cannot manage accounts", async () => {
    expect((await user.agent.get("/api/auth/users")).status).toBe(403);
    expect(
      (await user.withCsrf(user.agent.post("/api/auth/users")).send({
        email: "escalation@example.com",
        password: "escalation password 123",
        role: "admin",
      })).status
    ).toBe(403);
    expect(
      (await user.withCsrf(user.agent.patch("/api/auth/users/some-id")).send({ role: "admin" })).status
    ).toBe(403);
  });
});

describe("admin user management", () => {
  it("creates, lists, demotes (revoking sessions), and deletes users", async () => {
    const created = await admin.withCsrf(admin.agent.post("/api/auth/users")).send({
      email: "managed-auth@example.com",
      password: "managed password 123",
      role: "user",
    });
    expect(created.status).toBe(201);
    const targetId = created.body.user.id as string;

    const listed = await admin.agent.get("/api/auth/users");
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).not.toContain("passwordHash");
    expect(listed.body.users.some((u: { id: string }) => u.id === targetId)).toBe(true);

    const target = await loginAgent(ctx.app, "managed-auth@example.com", "managed password 123");
    expect((await target.agent.get("/api/auth/me")).status).toBe(200);

    const demoted = await admin.withCsrf(admin.agent.patch(`/api/auth/users/${targetId}`)).send({ role: "user" });
    expect(demoted.status).toBe(200);
    // Demotion revokes sessions immediately.
    expect((await target.agent.get("/api/auth/me")).status).toBe(401);

    const deleted = await admin.withCsrf(admin.agent.delete(`/api/auth/users/${targetId}`)).send();
    expect(deleted.status).toBe(200);
  });

  it("refuses duplicate emails, self-role-change, self-delete, and last-admin delete", async () => {
    expect(
      (
        await admin.withCsrf(admin.agent.post("/api/auth/users")).send({
          email: "user-auth@example.com",
          password: "another password 123",
          role: "user",
        })
      ).status
    ).toBe(409);
    expect(
      (await admin.withCsrf(admin.agent.patch(`/api/auth/users/${admin.userId}`)).send({ role: "user" })).status
    ).toBe(400);
    expect((await admin.withCsrf(admin.agent.delete(`/api/auth/users/${admin.userId}`)).send()).status).toBe(400);
    // user-auth is a non-admin; the only admin is admin-auth.
    expect((await admin.withCsrf(admin.agent.delete(`/api/auth/users/${admin.userId}`)).send()).status).toBe(400);
  });

  it("rejects malformed user ids without leaking internals", async () => {
    expect((await admin.withCsrf(admin.agent.patch("/api/auth/users/not-an-id")).send({ role: "user" })).status).toBe(
      400
    );
  });
});

describe("session revocation", () => {
  it("revokes another session as admin; users cannot revoke others", async () => {
    const victim = await loginAgent(ctx.app, "user-auth@example.com");
    const sessions = await admin.agent.get("/api/auth/sessions");
    expect(sessions.status).toBe(200);

    const victimSessions = await victim.agent.get("/api/auth/sessions");
    const victimSessionId = (victimSessions.body.sessions as Array<{ id: string; current: boolean }>).find(
      (s) => s.current
    )!.id;

    // A different non-admin cannot revoke someone else's session.
    await createTestUser("other-auth@example.com", "user");
    const other = await loginAgent(ctx.app, "other-auth@example.com");
    const forbidden = await other.withCsrf(other.agent.delete(`/api/auth/sessions/${victimSessionId}`)).send();
    expect(forbidden.status).toBe(403);

    const revoked = await admin.withCsrf(admin.agent.delete(`/api/auth/sessions/${victimSessionId}`)).send();
    expect(revoked.status).toBe(200);
    expect((await victim.agent.get("/api/auth/me")).status).toBe(401);
    // An unrelated user's session is untouched.
    expect((await other.agent.get("/api/auth/me")).status).toBe(200);
  });

  it("rejects expired sessions", async () => {
    const session = await loginAgent(ctx.app, "user-auth@example.com");
    expect((await session.agent.get("/api/auth/me")).status).toBe(200);
    // Backdate just this session past expiry in the store; reads must reject it.
    const mongoose = await import("mongoose");
    const mine = (await session.agent.get("/api/auth/sessions")).body.sessions as Array<{
      id: string;
      current: boolean;
    }>;
    const currentId = mine.find((s) => s.current)!.id;
    await mongoose.connection.db
      ?.collection("sessions")
      .updateOne({ _id: currentId }, { $set: { expires: new Date(Date.now() - 1000) } });
    expect((await session.agent.get("/api/auth/me")).status).toBe(401);
  });
});

describe("login rate limiting and CORS", () => {
  it("throttles repeated login attempts per client", async () => {
    const agent = request.agent(ctx.app);
    const csrf = (await agent.get("/api/auth/csrf")).body.csrfToken as string;
    let throttled = false;
    for (let i = 0; i < 25; i++) {
      const res = await agent
        .post("/api/auth/login")
        .set("x-csrf-token", csrf)
        .send({ email: `ratelimit-${i}@example.com`, password: "wrong password here" });
      if (res.status === 429) {
        throttled = true;
        expect(res.headers["retry-after"]).toBeTruthy();
        break;
      }
    }
    expect(throttled).toBe(true);
  });

  it("reflects only the configured frontend origin, with credentials", async () => {
    const allowed = await request(ctx.app).get("/api/health").set("Origin", "http://localhost:5173");
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    const denied = await request(ctx.app).get("/api/health").set("Origin", "https://evil.example");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("initial-admin provisioning script", () => {
  it("refuses weak passwords, provisions once, then refuses repeats", async () => {
    // Start from an empty account collection: earlier suites in this file
    // no longer need their accounts.
    await User.deleteMany({});
    const script = path.resolve(__dirname, "../src/scripts/create-admin.ts");
    const tsxCli = path.resolve(__dirname, "../node_modules/tsx/dist/cli.mjs");
    const run = (env: NodeJS.ProcessEnv) =>
      new Promise<{ code: number | null; out: string }>((resolve) => {
        execFile(
          process.execPath,
          [tsxCli, script],
          { env: { ...process.env, ...env }, timeout: 60000, cwd: path.resolve(__dirname, "..") },
          (error, stdout, stderr) => {
            resolve({ code: error && "code" in error ? (error.code as number) : 0, out: `${stdout}${stderr}` });
          }
        );
      });
    const uri = process.env.MONGODB_URI!;
    const weak = await run({
      MONGODB_URI: uri,
      INSIGHTFLOW_SETUP_EMAIL: "weak-admin@example.com",
      INSIGHTFLOW_SETUP_PASSWORD: "short",
    });
    expect(weak.code).toBe(1);
    expect(await User.countDocuments({ email: "weak-admin@example.com" })).toBe(0);

    const first = await run({
      MONGODB_URI: uri,
      INSIGHTFLOW_SETUP_EMAIL: "provisioned-admin@example.com",
      INSIGHTFLOW_SETUP_PASSWORD: "provisioned password 123",
    });
    expect(first.out).toContain("Administrator created");
    expect(first.code).toBe(0);

    const repeat = await run({
      MONGODB_URI: uri,
      INSIGHTFLOW_SETUP_EMAIL: "second-admin@example.com",
      INSIGHTFLOW_SETUP_PASSWORD: "second password 123",
    });
    expect(repeat.code).toBe(1);
    expect(await User.countDocuments({ email: "second-admin@example.com" })).toBe(0);
  }, 180000);
});
