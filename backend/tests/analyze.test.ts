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
  delete process.env.OPENAI_API_KEY;
  ctx = await startTestApp();
  await createTestUser("analyze-admin@example.com", "admin");
  authed = await loginAgent(ctx.app, "analyze-admin@example.com");
  const seed = [
    { review: "Seller took my money and never sent the product, total scam.", category: "Fraud and Scam" },
    { review: "Seller took my money and never sent the product, total scam.", category: "Fraud and Scam" },
    { review: "Seller took my money and never sent the product, total scam.", category: "Fraud and Scam" },
    { review: "Support resolved everything within minutes, excellent help.", category: "Customer Service" },
    { review: "My parcel arrived two weeks late with no tracking updates.", category: "Operational Issues" },
  ];
  for (const row of seed) {
    await authed.withCsrf(authed.agent.post("/api/feedback")).send(row);
  }
});

afterAll(async () => {
  await stopTestApp(ctx);
});

describe("POST /api/analyze", () => {
  it("runs the deterministic pipeline over unique patterns", async () => {
    const res = await authed.withCsrf(authed.agent.post("/api/analyze")).send({ method: "deterministic" });
    expect(res.status).toBe(200);
    expect(res.body.uniquePatterns).toBe(3);
    expect(res.body.succeeded).toBe(3);
    expect(res.body.rowsUpdated).toBe(5);
    expect(res.body.method).toMatch(/deterministic/);
    expect(res.body.issuesCreated).toBeGreaterThan(0);
  });

  it("prioritizes fraud above praise", async () => {
    const res = await authed.agent.get("/api/issues");
    expect(res.body.issues.length).toBeGreaterThan(0);
    const top = res.body.issues[0];
    expect(top.primary_topic).toBe("fraud-scam");
    expect(top.priority_band).toBe("high");
    expect(top.frequency_raw).toBe(3);
    expect(top.priority_explanation).toMatch(/45%.*35%.*20%/);
  });
});

describe("GET /api/analyze", () => {
  it("lists analysis runs", async () => {
    const res = await authed.agent.get("/api/analyze");
    expect(res.status).toBe(200);
    expect(res.body.runs.length).toBeGreaterThanOrEqual(1);
    expect(res.body.runs[0].method).toMatch(/deterministic/);
  });
});
