import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestApp, stopTestApp, type TestContext } from "./helpers";

let ctx: TestContext;

beforeAll(async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.ADAPTION_API_KEY;
  ctx = await startTestApp();
});

afterAll(async () => {
  await stopTestApp(ctx);
});

describe("GET /api/health", () => {
  it("reports connectivity without requiring auth", async () => {
    const res = await request(ctx.app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.database).toBe("connected");
    expect(typeof res.body.feedbackRows).toBe("number");
    expect(res.body.openaiConfigured).toBe(false);
    expect(res.body.adaptionConfigured).toBe(false);
    expect(typeof res.body.time).toBe("string");
  });

  it("serves strict security headers", async () => {
    const res = await request(ctx.app).get("/api/health");
    const csp = res.headers["content-security-policy"] as string;
    expect(csp).toContain("default-src 'self'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
