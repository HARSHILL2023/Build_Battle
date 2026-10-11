import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// Isolate storage: point the database at a temp file BEFORE loading lib modules.
process.env.INSIGHTFLOW_DB_PATH = join(mkdtempSync(join(tmpdir(), "if-test-")), "test.db");

const db = await import("@/lib/db");
const { runAnalysisPipeline } = await import("@/lib/ai/pipeline");
const { hashReview } = await import("@/lib/text");

function seed(rows: { review: string; category: string }[]) {
  db.insertFeedbackMany(
    rows.map((r) => ({
      review_text: r.review,
      source_category: r.category,
      norm_hash: hashReview(r.review, r.category),
      source: "csv",
      import_id: null,
    }))
  );
}

describe("analysis pipeline (deterministic, isolated database)", () => {
  beforeAll(() => {
    // Three copies of one scam report, one praise, one delivery complaint.
    seed([
      { review: "Seller took my money and never sent the product, total scam.", category: "Fraud and Scam" },
      { review: "Seller took my money and never sent the product, total scam.", category: "Fraud and Scam" },
      { review: "Seller took my money and never sent the product, total scam.", category: "Fraud and Scam" },
      { review: "Support resolved everything within minutes, excellent help.", category: "Customer Service" },
      { review: "My parcel arrived two weeks late with no tracking updates.", category: "Operational Issues" },
    ]);
  });

  it("classifies each unique pattern once and fans out to copies", async () => {
    const summary = await runAnalysisPipeline("deterministic", false);
    expect(summary.uniquePatterns).toBe(3);
    expect(summary.succeeded).toBe(3);
    expect(summary.rowsUpdated).toBe(5);
    expect(summary.method).toMatch(/deterministic/);
  });

  it("prioritizes fraud above praise with transparent scores", async () => {
    const issues = db.listIssues();
    expect(issues.length).toBeGreaterThan(0);
    const top = issues[0];
    expect(top.primary_topic).toBe("fraud-scam");
    expect(top.priority_band).toBe("high");
    expect(top.frequency_raw).toBe(3);
    expect(top.frequency_unique).toBe(1);
    expect(top.priority_explanation).toMatch(/45%.*35%.*20%/);
    expect(top.recommendation.length).toBeGreaterThan(20);
    const praise = issues.find((i) => i.category === "Customer Service");
    expect(praise).toBeDefined();
    expect(praise!.priority_score).toBeLessThan(top.priority_score);
  });

  it("preserves issue status across regeneration", async () => {
    const issues = db.listIssues();
    db.updateIssueStatus(issues[0].id, "in_progress");
    await runAnalysisPipeline("deterministic", false);
    const again = db.listIssues();
    const same = again.find((i) => i.title === issues[0].title);
    expect(same?.status).toBe("in_progress");
  });

  it("records honest provenance on every row", async () => {
    const row = db.getFeedbackById(1);
    expect(row?.analysis_status).toBe("analyzed");
    expect(row?.sentiment_method).toMatch(/deterministic/);
    expect(row?.sentiment).toBe("negative");
  });
});
