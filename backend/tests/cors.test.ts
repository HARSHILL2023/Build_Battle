import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetRateLimitBuckets } from "../src/utils/rateLimit";
import { startTestApp, stopTestApp, type TestContext } from "./helpers";

// Production CORS contract: the API echoes back an exact configured origin
// with credentials enabled, and never a wildcard. FRONTEND_ORIGIN accepts a
// comma-separated list so preview deployments are added explicitly.
const PROD_ORIGIN = "https://build-battle-frontend.vercel.app";
const PREVIEW_ORIGIN = "https://insightflow-git-preview-1a2b3c.vercel.app";
const EVIL_ORIGIN = "https://evil.example";

let ctx: TestContext;
let prevFrontendOrigin: string | undefined;

beforeAll(async () => {
  prevFrontendOrigin = process.env.FRONTEND_ORIGIN;
  // Deliberately messy (trailing slashes, stray spaces) like pasted
  // dashboard values: the parser must still match the bare browser Origin.
  process.env.FRONTEND_ORIGIN = `${PROD_ORIGIN}/ , ${PREVIEW_ORIGIN}/`;
  resetRateLimitBuckets();
  ctx = await startTestApp();
});

afterAll(async () => {
  if (prevFrontendOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
  else process.env.FRONTEND_ORIGIN = prevFrontendOrigin;
  await stopTestApp(ctx);
});

describe("CORS preflight", () => {
  it("allows the production origin with credentials, never a wildcard", async () => {
    const res = await request(ctx.app)
      .options("/api/auth/demo")
      .set("Origin", PROD_ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type, x-csrf-token");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(PROD_ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-allow-origin"]).not.toBe("*");
    expect(res.headers["access-control-allow-methods"] ?? "").toMatch(/POST/);
    expect(res.headers["access-control-allow-headers"] ?? "").toMatch(/x-csrf-token/i);
  });

  it("allows an explicitly listed preview origin with an exact echo", async () => {
    const res = await request(ctx.app)
      .options("/api/auth/login")
      .set("Origin", PREVIEW_ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type, x-csrf-token");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(PREVIEW_ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("refuses an unlisted origin without echoing it", async () => {
    const res = await request(ctx.app)
      .options("/api/auth/demo")
      .set("Origin", EVIL_ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type, x-csrf-token");
    expect(res.status).not.toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });
});

describe("credentialed cross-origin requests", () => {
  it("serves public endpoints with the exact origin echoed", async () => {
    const health = await request(ctx.app).get("/api/health").set("Origin", PROD_ORIGIN);
    expect(health.status).toBe(200);
    expect(health.headers["access-control-allow-origin"]).toBe(PROD_ORIGIN);
    expect(health.headers["access-control-allow-credentials"]).toBe("true");

    const csrf = await request(ctx.app).get("/api/auth/csrf").set("Origin", PROD_ORIGIN);
    expect(csrf.status).toBe(200);
    expect(csrf.headers["access-control-allow-origin"]).toBe(PROD_ORIGIN);
    expect(typeof (csrf.body as { csrfToken: unknown }).csrfToken).toBe("string");
  });

  it("serves health checks without an Origin header", async () => {
    const res = await request(ctx.app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 401 WITH CORS headers for unauthenticated session probes", async () => {
    // Production regression: GET /api/auth/me answered 401 without
    // Access-Control-Allow-Origin, so the browser reported a CORS error
    // instead of the real auth status. CORS runs before auth, so an
    // allowlisted origin is echoed even on rejection responses.
    const res = await request(ctx.app).get("/api/auth/me").set("Origin", PROD_ORIGIN);
    expect(res.status).toBe(401);
    expect(res.headers["access-control-allow-origin"]).toBe(PROD_ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("completes demo entry with cookies and keeps CSRF enforced", async () => {
    const agent = request.agent(ctx.app);
    const csrfRes = await agent.get("/api/auth/csrf").set("Origin", PROD_ORIGIN);
    expect(csrfRes.status).toBe(200);
    const anonCsrf = (csrfRes.body as { csrfToken: string }).csrfToken;

    const demo = await agent
      .post("/api/auth/demo")
      .set("Origin", PROD_ORIGIN)
      .set("x-csrf-token", anonCsrf)
      .send({});
    expect(demo.status).toBe(200);
    const cookies = (demo.headers["set-cookie"] ?? []).join(";");
    expect(cookies).toMatch(/insightflow\.sid=/);
    expect(cookies).toMatch(/HttpOnly/);

    const me = await agent.get("/api/auth/me").set("Origin", PROD_ORIGIN);
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ isDemo: true });

    const noToken = await request
      .agent(ctx.app)
      .post("/api/auth/demo")
      .set("Origin", PROD_ORIGIN)
      .send({});
    expect(noToken.status).toBe(403);
  });
});
