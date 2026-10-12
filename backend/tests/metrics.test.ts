import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { Feedback } from "../src/models/Feedback";
import { evaluateQuality } from "../src/services/adaption/localAdapter";
import {
  getDashboardMetrics,
  getQualityStats,
  invalidateMetrics,
} from "../src/services/metricsService";
import {
  createTestUser,
  loginAgent,
  startTestApp,
  stopTestApp,
  type TestContext,
} from "./helpers";

let ctx: TestContext;

function keyOf(review: string, category: string): string {
  const norm = review
    .toLowerCase()
    .replace(/["'“”‘’`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(`${norm}||${category.trim().toLowerCase()}`).digest("hex");
}

interface SeedRow {
  review: string;
  category: string;
  sentiment: string | null;
  topics: string[];
  status: string;
}

// Adversarial mix: duplicates, empties, quotes/unicode, astral emoji, and a
// cross-category duplicate (same text, different category).
const ROWS: SeedRow[] = [
  { review: "Great product, love it!", category: "Product Feedback", sentiment: "positive", topics: ["general-praise"], status: "analyzed" },
  { review: "Great product, love it!", category: "Product Feedback", sentiment: "positive", topics: ["general-praise"], status: "analyzed" },
  { review: "Terrible delivery, arrived broken.", category: "Operational Issues", sentiment: "negative", topics: ["delivery", "product-quality"], status: "analyzed" },
  { review: "   ", category: "Customer Service", sentiment: null, topics: [], status: "pending" },
  { review: "", category: "Customer Service", sentiment: null, topics: [], status: "pending" },
  { review: "It's \"okay\" — fine, I guess…", category: "Customer Service", sentiment: "neutral", topics: ["customer-support"], status: "analyzed" },
  { review: "Loved it! 😍😍", category: "Product Feedback", sentiment: "positive", topics: ["general-praise"], status: "analyzed" },
  { review: "Loved it!", category: "Operational Issues", sentiment: "positive", topics: ["general-praise"], status: "analyzed" },
  { review: "Great product love it", category: "Operational Issues", sentiment: null, topics: [], status: "pending" },
];

async function seedRows(): Promise<void> {
  await Feedback.deleteMany({});
  invalidateMetrics();
  const validated = ROWS.filter((r) => r.review !== "");
  await Feedback.insertMany(
    validated.map((r, i) => ({
      reviewText: r.review,
      sourceCategory: r.category,
      normHash: keyOf(r.review, r.category),
      sentiment: r.sentiment,
      sentimentMethod: r.sentiment ? "deterministic:keyword-rules-v1" : null,
      topics: r.topics,
      analysisStatus: r.status,
      source: "manual",
      importId: null,
      sqliteId: 1000 + i,
    }))
  );
  // Empty strings fail schema validation (the API never stores them), so the
  // legacy-style empty row bypasses validation exactly like old imports could.
  for (const r of ROWS.filter((r) => r.review === "")) {
    await Feedback.collection.insertOne({
      reviewText: r.review,
      sourceCategory: r.category,
      normHash: keyOf(r.review, r.category),
      sentiment: r.sentiment,
      sentimentMethod: null,
      topics: r.topics,
      analysisStatus: r.status,
      source: "manual",
      importId: null,
      sqliteId: 1000 + validated.length,
      createdAt: new Date(),
    });
  }
}

beforeAll(async () => {
  ctx = await startTestApp();
  await createTestUser("metrics@example.com", "admin");
  await seedRows();
});

afterAll(async () => {
  await stopTestApp(ctx);
});

beforeEach(() => {
  invalidateMetrics();
});

describe("dashboard metrics equivalence", () => {
  it("matches hand-computed totals, sentiment, topics, and top patterns", async () => {
    const m = await getDashboardMetrics();
    expect(m.totalRecords).toBe(9);
    expect(m.analyzed).toBe(6);
    expect(m.pending).toBe(3);
    expect(m.failed).toBe(0);
    expect(m.sentiment).toEqual({ positive: 4, neutral: 1, negative: 1, unanalyzed: 3 });

    const praise = m.byTopic.find((t) => t.topic === "general-praise");
    expect(praise).toMatchObject({ raw: 4, unique: 3, negative: 0 });
    const delivery = m.byTopic.find((t) => t.topic === "delivery");
    expect(delivery).toMatchObject({ raw: 1, unique: 1, negative: 1 });
    expect(m.byTopic[0]?.topic).toBe("general-praise");

    expect(m.topPatterns[0]).toMatchObject({ count: 2 });
    expect(typeof m.quality.score).toBe("number");
  });

  it("grades identically to the row-scanning quality path", async () => {
    const raw = (await Feedback.find({}).select("reviewText sourceCategory").lean()) as {
      reviewText: string;
      sourceCategory: string;
    }[];
    const expected = evaluateQuality(raw.map((r) => ({ review_text: r.reviewText, source_category: r.sourceCategory })));
    const stats = await getQualityStats();
    expect(stats).toMatchObject({ rawRows: 9, emptySkipped: 2, uniquePatterns: 6, duplicateRows: 1 });
    const m = await getDashboardMetrics();
    expect(m.quality.score).toBe(expected.score);
    expect(m.quality.grade).toBe(expected.grade);
  });

  it("documents code-point length semantics on astral input without changing the grade", async () => {
    const stats = await getQualityStats();
    const utf16Len = ROWS.filter((r) => r.review.trim())
      .map((r) => r.review.trim().length)
      .reduce((a, b) => a + b, 0);
    // "😍😍" counts 4 UTF-16 units but 2 code points: the aggregation is
    // explicit about using code points, and the grade is unaffected here.
    expect(stats.totalLen).toBe(utf16Len - 2);
    const m = await getDashboardMetrics();
    expect(m.quality.grade).toBe("D");
  });
});

describe("metrics cache", () => {
  it("serves repeats from cache and refreshes after invalidation", async () => {
    const first = await getDashboardMetrics();
    await Feedback.create({
      reviewText: "One more data point for the cache test.",
      sourceCategory: "Customer Service",
      normHash: keyOf("One more data point for the cache test.", "Customer Service"),
      source: "manual",
      importId: null,
      sqliteId: 2001,
    });
    const cached = await getDashboardMetrics();
    expect(cached.totalRecords).toBe(first.totalRecords);
    invalidateMetrics();
    const fresh = await getDashboardMetrics();
    expect(fresh.totalRecords).toBe(first.totalRecords + 1);
    await Feedback.deleteOne({ sqliteId: 2001 });
    invalidateMetrics();
  });

  it("recomputes after the TTL expires", async () => {
    vi.useFakeTimers();
    try {
      const first = await getDashboardMetrics();
      await Feedback.create({
        reviewText: "TTL probe row.",
        sourceCategory: "Customer Service",
        normHash: keyOf("TTL probe row.", "Customer Service"),
        source: "manual",
        importId: null,
        sqliteId: 2002,
      });
      expect((await getDashboardMetrics()).totalRecords).toBe(first.totalRecords);
      vi.setSystemTime(Date.now() + 31_000);
      expect((await getDashboardMetrics()).totalRecords).toBe(first.totalRecords + 1);
      await Feedback.deleteOne({ sqliteId: 2002 });
      invalidateMetrics();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reflects workspace writes made through the API", async () => {
    const authed = await loginAgent(ctx.app, "metrics@example.com");
    const before = (await authed.agent.get("/api/metrics")).body as { totalRecords: number };
    const created = await authed.withCsrf(authed.agent.post("/api/feedback")).send({
      review: "API-level cache invalidation probe.",
      category: "Customer Service",
    });
    expect(created.status).toBe(201);
    const after = (await authed.agent.get("/api/metrics")).body as { totalRecords: number };
    expect(after.totalRecords).toBe(before.totalRecords + 1);
  });
});

describe("feedback indexes", () => {
  it("keeps the query-path indexes the list and metrics endpoints rely on", async () => {
    const names = (await Feedback.collection.listIndexes().toArray()).map((i) => i.name);
    for (const name of ["normHash_1", "analysisStatus_1", "sentiment_1", "sourceCategory_1", "topics_1"]) {
      expect(names).toContain(name);
    }
  });
});
