import { describe, expect, it } from "vitest";
import {
  UNIVERSAL_PROMPT,
  evaluateQuality,
  prepareForAnalysis,
} from "@/lib/adaption/localAdapter";

const rows = [
  { review_text: "Late delivery", source_category: "Operational Issues", norm_hash: "a" },
  { review_text: "Late delivery", source_category: "Operational Issues", norm_hash: "a" },
  { review_text: "Great product", source_category: "Product Feedback", norm_hash: "b" },
];

describe("prepareForAnalysis", () => {
  it("folds duplicates into unique patterns with counts", () => {
    const prep = prepareForAnalysis(rows);
    expect(prep.rawRows).toBe(3);
    expect(prep.uniquePatterns).toBe(2);
    expect(prep.duplicateRows).toBe(1);
    const dup = prep.prepared.find((p) => p.normHash === "a");
    expect(dup?.rowCount).toBe(2);
  });

  it("maps columns to a universal prompt plus context", () => {
    const prep = prepareForAnalysis(rows);
    for (const p of prep.prepared) {
      expect(p.prompt).toBe(UNIVERSAL_PROMPT);
      expect(p.context.length).toBeGreaterThan(0);
      expect(p.sourceCategory.length).toBeGreaterThan(0);
    }
    expect(UNIVERSAL_PROMPT).toMatch(/sentiment/i);
  });
});

describe("evaluateQuality", () => {
  it("scores in range with a letter grade and honest checks", () => {
    const q = evaluateQuality(rows);
    expect(q.score).toBeGreaterThanOrEqual(1);
    expect(q.score).toBeLessThanOrEqual(10);
    expect(["A", "B", "C", "D", "F"]).toContain(q.grade);
    expect(q.rawRows).toBe(3);
    expect(q.uniquePatterns).toBe(2);
    expect(q.duplicateRows).toBe(1);
    expect(q.checks.length).toBeGreaterThan(0);
    const timestamps = q.checks.find((c) => c.name === "No timestamps in source");
    expect(timestamps?.passed).toBe(false);
  });

  it("penalizes heavy duplication", () => {
    const dupes = Array.from({ length: 100 }, (_, i) => ({
      review_text: "Same complaint",
      source_category: "Operational Issues",
      norm_hash: `h${i % 2}`,
    }));
    const varied = Array.from({ length: 100 }, (_, i) => ({
      review_text: `Distinct complaint number ${i} with enough detail to be meaningful`,
      source_category: ["Operational Issues", "Product Feedback", "Customer Service", "Fraud and Scam"][i % 4],
      norm_hash: `u${i}`,
    }));
    expect(evaluateQuality(dupes).score).toBeLessThanOrEqual(evaluateQuality(varied).score);
  });
});
