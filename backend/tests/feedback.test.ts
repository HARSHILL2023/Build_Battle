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
  await createTestUser("feedback-admin@example.com", "admin");
  authed = await loginAgent(ctx.app, "feedback-admin@example.com");
});

afterAll(async () => {
  await stopTestApp(ctx);
});

describe("POST /api/feedback", () => {
  it("creates valid feedback with 201", async () => {
    const res = await authed
      .withCsrf(authed.agent.post("/api/feedback"))
      .send({ review: "The delivery was two weeks late.", category: "Operational Issues" });
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe("number");
    expect(res.body.message).toBe("Feedback saved.");
  });

  it("rejects short reviews with 400", async () => {
    const res = await authed
      .withCsrf(authed.agent.post("/api/feedback"))
      .send({ review: "ok", category: "Other" });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
  });

  it("rejects invalid categories with 400", async () => {
    const res = await authed
      .withCsrf(authed.agent.post("/api/feedback"))
      .send({ review: "A perfectly fine review text here.", category: "Shipping" });
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await authed.agent
      .post("/api/feedback")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Request body must be valid JSON.");
  });
});

describe("GET /api/feedback", () => {
  it("paginates results", async () => {
    for (let i = 0; i < 7; i++) {
      await authed
        .withCsrf(authed.agent.post("/api/feedback"))
        .send({ review: `Paginated review number ${i} with enough text.`, category: "Other" });
    }
    const res = await authed.agent.get("/api/feedback?page=1&pageSize=5");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(5);
    expect(res.body.total).toBeGreaterThanOrEqual(7);
    expect(res.body.totalPages).toBeGreaterThanOrEqual(2);
  });

  it("rejects NoSQL injection shapes in query params", async () => {
    const res = await authed.agent.get("/api/feedback?q[$gt]=");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid query parameters.");
  });

  it("rejects invalid pagination with 400", async () => {
    const res = await authed.agent.get("/api/feedback?page=abc");
    expect(res.status).toBe(400);
  });
});

describe("GET/DELETE /api/feedback/:id", () => {
  it("returns 400 for non-numeric ids", async () => {
    expect((await authed.agent.get("/api/feedback/abc")).status).toBe(400);
    expect((await authed.withCsrf(authed.agent.delete("/api/feedback/0")).send()).status).toBe(400);
  });

  it("returns 404 for missing rows", async () => {
    expect((await authed.agent.get("/api/feedback/999999")).status).toBe(404);
  });

  it("deletes an existing row", async () => {
    const created = await authed
      .withCsrf(authed.agent.post("/api/feedback"))
      .send({ review: "This row will be deleted shortly.", category: "Other" });
    const id = created.body.id as number;
    expect((await authed.agent.get(`/api/feedback/${id}`)).status).toBe(200);
    expect((await authed.withCsrf(authed.agent.delete(`/api/feedback/${id}`)).send()).status).toBe(200);
    expect((await authed.agent.get(`/api/feedback/${id}`)).status).toBe(404);
  });
});
