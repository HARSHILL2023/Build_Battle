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
  await createTestUser("import-admin@example.com", "admin");
  authed = await loginAgent(ctx.app, "import-admin@example.com");
});

afterAll(async () => {
  await stopTestApp(ctx);
});

describe("POST /api/import", () => {
  it("rejects unknown samples with 400", async () => {
    const res = await authed.withCsrf(authed.agent.post("/api/import")).send({ sample: "bogus" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/official-500|official-full/);
  });

  it("loads the 500-row official sample with 201", async () => {
    const res = await authed.withCsrf(authed.agent.post("/api/import")).send({ sample: "official-500" });
    expect(res.status).toBe(201);
    expect(res.body.importedRows).toBe(500);
    expect(typeof res.body.importId).toBe("number");
  });

  it("imports a valid CSV file with 201", async () => {
    const csv = "review,category\nGreat product overall,Product Feedback\nLate again,Operational Issues\n";
    const res = await authed
      .withCsrf(authed.agent.post("/api/import"))
      .attach("file", Buffer.from(csv), "upload.csv");
    expect(res.status).toBe(201);
    expect(res.body.importedRows).toBe(2);
  });

  it("rejects non-CSV uploads with 400", async () => {
    const res = await authed
      .withCsrf(authed.agent.post("/api/import"))
      .attach("file", Buffer.from("hello"), "notes.txt");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/\.csv/i);
  });

  it("rejects oversized uploads with 400", async () => {
    const big = Buffer.alloc(8 * 1024 * 1024 + 1, "x");
    const res = await authed
      .withCsrf(authed.agent.post("/api/import"))
      .attach("file", big, "big.csv");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too large/i);
  });

  it("rejects headerless CSVs with 400 and never 2xx on failure", async () => {
    const res = await authed
      .withCsrf(authed.agent.post("/api/import"))
      .attach("file", Buffer.from("name,age\nAl,30\n"), "bad.csv");
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
  });
});

describe("GET /api/import", () => {
  it("lists import history", async () => {
    const res = await authed.agent.get("/api/import");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.imports)).toBe(true);
    expect(res.body.imports.length).toBeGreaterThanOrEqual(2);
  });
});
