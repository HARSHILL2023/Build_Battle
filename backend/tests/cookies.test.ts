import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resetRateLimitBuckets } from "../src/utils/rateLimit";
import { sessionMiddleware } from "../src/middleware/session";
import { startTestApp, stopTestApp, type TestContext } from "./helpers";

// Production cookie contract: cross-site session auth (Vercel frontend,
// Render backend) requires SameSite=None with Secure, or browsers silently
// drop the session cookie and every login/demo attempt fails.
const PROD_ORIGIN = "https://buildbattle-frontend.vercel.app";

let ctx: TestContext;
const prev: Record<string, string | undefined> = {};

beforeAll(async () => {
  for (const key of ["FRONTEND_ORIGIN", "COOKIE_SAMESITE", "COOKIE_SECURE"] as const) {
    prev[key] = process.env[key];
  }
  process.env.FRONTEND_ORIGIN = PROD_ORIGIN;
  process.env.COOKIE_SAMESITE = "none";
  process.env.COOKIE_SECURE = "true";
  resetRateLimitBuckets();
  ctx = await startTestApp();
});

afterAll(async () => {
  for (const [key, value] of Object.entries(prev)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await stopTestApp(ctx);
});

function setCookies(res: request.Response): string[] {
  return (res.headers["set-cookie"] ?? []) as unknown as string[];
}

// Render terminates TLS at its proxy and forwards X-Forwarded-Proto: https.
// The app trusts one proxy hop (see server.ts), so tests reproduce a secure
// connection with this header; without it express-session correctly refuses
// to emit Secure cookies over plain HTTP.
function secure(req: request.Test): request.Test {
  return req.set("X-Forwarded-Proto", "https");
}

describe("cross-site session cookies", () => {
  it("mints cookies with SameSite=None, Secure, and HttpOnly", async () => {
    const csrfRes = await secure(request(ctx.app).get("/api/auth/csrf")).set(
      "Origin",
      PROD_ORIGIN
    );
    expect(csrfRes.status).toBe(200);
    const jar = setCookies(csrfRes).join(";");
    expect(jar).toMatch(/insightflow\.sid=/);
    expect(jar).toMatch(/SameSite=None/);
    expect(jar).toMatch(/Secure/);
    expect(jar).toMatch(/HttpOnly/);
  });

  it("keeps the demo session alive across cross-site requests", async () => {
    const csrfRes = await secure(request(ctx.app).get("/api/auth/csrf")).set(
      "Origin",
      PROD_ORIGIN
    );
    const token = (csrfRes.body as { csrfToken: string }).csrfToken;
    const demoRes = await secure(request(ctx.app).post("/api/auth/demo"))
      .set("Origin", PROD_ORIGIN)
      .set("Cookie", setCookies(csrfRes))
      .set("x-csrf-token", token)
      .send({});
    expect(demoRes.status).toBe(200);
    const rotated = setCookies(demoRes).join(";");
    expect(rotated).toMatch(/SameSite=None/);
    expect(rotated).toMatch(/Secure/);

    const me = await secure(request(ctx.app).get("/api/auth/me"))
      .set("Origin", PROD_ORIGIN)
      .set("Cookie", setCookies(demoRes));
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ isDemo: true });

    const logout = await secure(request(ctx.app).post("/api/auth/logout"))
      .set("Origin", PROD_ORIGIN)
      .set("Cookie", setCookies(demoRes))
      .set("x-csrf-token", (demoRes.body as { csrfToken: string }).csrfToken)
      .send();
    expect(logout.status).toBe(200);
    const cleared = setCookies(logout).join(";");
    expect(cleared).toMatch(/insightflow\.sid=/);
    expect(cleared).toMatch(/SameSite=None/);
    expect(cleared).toMatch(/1970/);
  });

  it("refuses SameSite=None without Secure at boot", () => {
    const savedSamesite = process.env.COOKIE_SAMESITE;
    const savedSecure = process.env.COOKIE_SECURE;
    process.env.COOKIE_SAMESITE = "none";
    process.env.COOKIE_SECURE = "false";
    try {
      expect(() => sessionMiddleware()).toThrow(/COOKIE_SAMESITE=none requires COOKIE_SECURE=true/);
    } finally {
      if (savedSamesite === undefined) delete process.env.COOKIE_SAMESITE;
      else process.env.COOKIE_SAMESITE = savedSamesite;
      if (savedSecure === undefined) delete process.env.COOKIE_SECURE;
      else process.env.COOKIE_SECURE = savedSecure;
    }
  });

  it("warns when an HTTPS origin meets a non-None SameSite", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const savedSamesite = process.env.COOKIE_SAMESITE;
    process.env.COOKIE_SAMESITE = "lax";
    try {
      sessionMiddleware();
      expect(spy).toHaveBeenCalledWith(expect.stringMatching(/COOKIE_SAMESITE=none/));
    } finally {
      if (savedSamesite === undefined) delete process.env.COOKIE_SAMESITE;
      else process.env.COOKIE_SAMESITE = savedSamesite;
      spy.mockRestore();
    }
  });
});
