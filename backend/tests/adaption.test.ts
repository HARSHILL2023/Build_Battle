import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestUser,
  loginAgent,
  startTestApp,
  stopTestApp,
  type AuthedClient,
  type TestContext,
} from "./helpers";

let ctx: TestContext;
let authed: AuthedClient;

beforeAll(async () => {
  delete process.env.ADAPTION_API_KEY;
  ctx = await startTestApp();
  await createTestUser("adaption-admin@example.com", "admin");
  authed = await loginAgent(ctx.app, "adaption-admin@example.com");
});

afterAll(async () => {
  await stopTestApp(ctx);
});

describe("GET /api/adaption", () => {
  it("reports local-adapter mode when unconfigured", async () => {
    const res = await authed.agent.get("/api/adaption");
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.mode).toBe("local-adapter");
    expect(typeof res.body.quality.score).toBe("number");
    expect(Array.isArray(res.body.history)).toBe(true);
  });
});

describe("POST /api/adaption", () => {
  it("is honest about the missing live connection", async () => {
    const res = await authed.withCsrf(authed.agent.post("/api/adaption")).send({ action: "test" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.status).toBeNull();
    expect(res.body.message).toMatch(/not set/i);
  });

  it("evaluates quality locally", async () => {
    const res = await authed.withCsrf(authed.agent.post("/api/adaption")).send({ action: "evaluate" });
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("local-adapter");
    expect(typeof res.body.quality.score).toBe("number");
  });

  it("prepares deduplicated patterns locally", async () => {
    const res = await authed.withCsrf(authed.agent.post("/api/adaption")).send({ action: "prepare" });
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("local-adapter");
    expect(typeof res.body.uniquePatterns).toBe("number");
  });

  it("rejects unknown actions with 400", async () => {
    const res = await authed.withCsrf(authed.agent.post("/api/adaption")).send({ action: "launch" });
    expect(res.status).toBe(400);
  });
});
