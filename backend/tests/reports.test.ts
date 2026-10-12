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
  ctx = await startTestApp();
  await createTestUser("reports-admin@example.com", "admin");
  authed = await loginAgent(ctx.app, "reports-admin@example.com");
  await authed
    .withCsrf(authed.agent.post("/api/feedback"))
    .send({ review: "=1+1 malicious formula cell", category: "Other" });
  await authed
    .withCsrf(authed.agent.post("/api/feedback"))
    .send({ review: "A normal review for the export.", category: "Other" });
});

afterAll(async () => {
  await stopTestApp(ctx);
});

describe("GET /api/reports", () => {
  it("returns a JSON summary by default", async () => {
    const res = await authed.agent.get("/api/reports");
    expect(res.status).toBe(200);
    expect(typeof res.body.generatedAt).toBe("string");
    expect(res.body.coverage.totalRecords).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(res.body.limitations)).toBe(true);
  });

  it("exports feedback CSV with formula-injection guards", async () => {
    const res = await authed.agent.get("/api/reports?format=csv&type=feedback");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/insightflow-feedback\.csv/);
    expect(res.text.split("\r\n")[0]).toContain("review");
    expect(res.text).toContain("'=1+1");
    expect(res.text).not.toMatch(/(^|[\r\n,])=1\+1/);
  });

  it("exports issues CSV with attachment disposition", async () => {
    const res = await authed.agent.get("/api/reports?format=csv&type=issues");
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/insightflow-issues\.csv/);
  });
});
