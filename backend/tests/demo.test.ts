import request from "supertest";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
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

let ctx: TestContext;
let demo: AuthedClient;
let admin: AuthedClient;

async function loginDemo(app: TestContext["app"]): Promise<AuthedClient> {
  const agent = request.agent(app);
  const csrfRes = await agent.get("/api/auth/csrf");
  expect(csrfRes.status).toBe(200);
  const anonCsrf = (csrfRes.body as { csrfToken: string }).csrfToken;
  const res = await agent.post("/api/auth/demo").set("x-csrf-token", anonCsrf).send({});
  expect(res.status).toBe(200);
  const body = res.body as { csrfToken: string; user: { id: string } };
  const csrfToken = body.csrfToken;
  return {
    agent,
    csrfToken,
    userId: body.user.id,
    withCsrf: (req: request.Test) => req.set("x-csrf-token", csrfToken),
  };
}

beforeAll(async () => {
  ctx = await startTestApp();
  resetRateLimitBuckets();
  await createTestUser("admin-demo@example.com", "admin");
  admin = await loginAgent(ctx.app, "admin-demo@example.com");
  demo = await loginDemo(ctx.app);
});

afterAll(async () => {
  await stopTestApp(ctx);
});

describe("demo login", () => {
  it("provisions the shared read-only account and reports isDemo", async () => {
    const me = await demo.agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ email: "demo@insightflow.local", role: "user", isDemo: true });
    const doc = await User.findOne({ email: "demo@insightflow.local" }).select("+passwordHash").lean();
    expect(doc?.isDemo).toBe(true);
    expect(doc?.role).toBe("user");
    expect(doc?.passwordHash).toBeTruthy();
  });

  it("gives concurrent visitors independent sessions on the same account", async () => {
    resetRateLimitBuckets();
    const second = await loginDemo(ctx.app);
    expect(second.csrfToken).not.toBe(demo.csrfToken);
    expect(second.userId).toBe(demo.userId);
    expect((await second.agent.get("/api/auth/me")).status).toBe(200);
    expect((await demo.agent.get("/api/auth/me")).status).toBe(200);
  });

  it("rejects password login into the demo account with the generic error", async () => {
    resetRateLimitBuckets();
    const agent = request.agent(ctx.app);
    const csrf = (await agent.get("/api/auth/csrf")).body.csrfToken as string;
    const res = await agent
      .post("/api/auth/login")
      .set("x-csrf-token", csrf)
      .send({ email: "demo@insightflow.local", password: TEST_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid email or password." });
  });

  it("requires a CSRF token for demo login", async () => {
    const res = await request.agent(ctx.app).post("/api/auth/demo").send({});
    expect(res.status).toBe(403);
  });

  it("returns 403 when demo mode is disabled", async () => {
    const prev = process.env.DEMO_ENABLED;
    process.env.DEMO_ENABLED = "false";
    try {
      resetRateLimitBuckets();
      const agent = request.agent(ctx.app);
      const csrf = (await agent.get("/api/auth/csrf")).body.csrfToken as string;
      const res = await agent.post("/api/auth/demo").set("x-csrf-token", csrf).send({});
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "Demo access is disabled." });
    } finally {
      if (prev === undefined) delete process.env.DEMO_ENABLED;
      else process.env.DEMO_ENABLED = prev;
    }
  });
});

describe("demo read access", () => {
  it("allows every read-only page API", async () => {
    for (const path of [
      "/api/metrics",
      "/api/feedback",
      "/api/import",
      "/api/analyze",
      "/api/issues",
      "/api/reports",
      "/api/adaption",
      "/api/auth/me",
      "/api/auth/sessions",
    ]) {
      const res = await demo.agent.get(path);
      expect(res.status, `GET ${path}`).toBe(200);
    }
  });
});

describe("demo write denial (server-side)", () => {
  it("rejects every state-changing workspace request with 403", async () => {
    const cases: [string, string, unknown][] = [
      ["post", "/api/feedback", { review: "demo write attempt", category: "Other" }],
      ["delete", "/api/feedback/1", {}],
      ["post", "/api/import", { sample: "official-500" }],
      ["post", "/api/analyze", { method: "auto", onlyPending: false }],
      ["patch", "/api/issues/1", { status: "in_progress" }],
      ["delete", "/api/issues/1", {}],
      ["post", "/api/adaption", { action: "test" }],
      ["delete", "/api/data", { confirm: "DELETE ALL DATA" }],
    ];
    for (const [method, path, body] of cases) {
      const req =
        method === "post"
          ? demo.agent.post(path)
          : method === "patch"
            ? demo.agent.patch(path)
            : demo.agent.delete(path);
      const res = await demo.withCsrf(req).send(body);
      expect(res.status, `${method.toUpperCase()} ${path}`).toBe(403);
      expect(res.body).toEqual({ error: "Demo accounts are read-only. Log in with a full account to make changes." });
    }
  });

  it("rejects demo session revocation and all admin account operations", async () => {
    const sessions = await demo.agent.get("/api/auth/sessions");
    expect(sessions.status).toBe(200);
    const ownId = (sessions.body as { sessions: { id: string }[] }).sessions[0]?.id ?? "missing";
    expect((await demo.withCsrf(demo.agent.delete(`/api/auth/sessions/${ownId}`))).status).toBe(403);
    expect((await demo.agent.get("/api/auth/users")).status).toBe(403);
    expect(
      (
        await demo.withCsrf(demo.agent.post("/api/auth/users")).send({
          email: "x@example.com",
          password: "a long password 123",
        })
      ).status
    ).toBe(403);
  });

  it("refuses to promote the demo account to admin", async () => {
    const res = await admin.withCsrf(admin.agent.patch(`/api/auth/users/${demo.userId}`)).send({ role: "admin" });
    expect(res.status).toBe(400);
    expect((await User.findById(demo.userId).select("role").lean())?.role).toBe("user");
  });

  it("lets demo visitors log out, invalidating the session", async () => {
    resetRateLimitBuckets();
    const one = await loginDemo(ctx.app);
    expect((await one.withCsrf(one.agent.post("/api/auth/logout"))).status).toBe(200);
    expect((await one.agent.get("/api/auth/me")).status).toBe(401);
  });
});

describe("full accounts are unaffected", () => {
  it("admin login still writes normally", async () => {
    const res = await admin
      .withCsrf(admin.agent.post("/api/feedback"))
      .send({ review: "admin write still works after demo mode", category: "Other" });
    expect([200, 201]).toContain(res.status);
  });
});
