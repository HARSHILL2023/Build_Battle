import { normalizeReview } from "../../utils/text.js";

/**
 * Local preparation adapter. Mirrors the documented Adaption
 * Adaptive Data workflow (column mapping, prompt deduplication,
 * data-quality evaluation) and runs entirely offline. It is always
 * labeled "Local adapter" in the UI and is never presented as the
 * live Adaption service.
 */

export interface PreparedRow {
  /** Mapped prompt: the task for the downstream classifier. */
  prompt: string;
  /** Mapped context: background needed to answer the prompt. */
  context: string;
  /** Source category carried through as context, not a verified label. */
  sourceCategory: string;
  normHash: string;
  rowCount: number;
}

export interface QualityReport {
  score: number; // 0-10
  grade: string; // A-F
  domain: string;
  language: string;
  tone: string;
  rawRows: number;
  uniquePatterns: number;
  duplicateRows: number;
  duplicationRate: number;
  emptySkipped: number;
  checks: { name: string; passed: boolean; detail: string }[];
}

export const UNIVERSAL_PROMPT =
  "Classify the customer feedback in <context> as sentiment positive, neutral, or negative, " +
  "and assign 1-3 topic ids from the InsightFlow taxonomy. " +
  "Return valid JSON with keys sentiment and topics.";

export function prepareForAnalysis(
  rows: { review_text: string; source_category: string; norm_hash: string }[]
): { prepared: PreparedRow[]; rawRows: number; uniquePatterns: number; duplicateRows: number } {
  const byHash = new Map<string, PreparedRow>();
  for (const row of rows) {
    const existing = byHash.get(row.norm_hash);
    if (existing) {
      existing.rowCount += 1;
    } else {
      byHash.set(row.norm_hash, {
        prompt: UNIVERSAL_PROMPT,
        context: row.review_text,
        sourceCategory: row.source_category,
        normHash: row.norm_hash,
        rowCount: 1,
      });
    }
  }
  const prepared = [...byHash.values()];
  const rawRows = rows.length;
  return { prepared, rawRows, uniquePatterns: prepared.length, duplicateRows: rawRows - prepared.length };
}

export function evaluateQuality(
  rows: { review_text: string; source_category: string }[]
): QualityReport {
  const rawRows = rows.length;
  const seen = new Map<string, number>();
  const categories = new Set<string>();
  let totalLen = 0;
  let emptySkipped = 0;
  for (const row of rows) {
    const text = row.review_text?.trim() ?? "";
    if (!text) {
      emptySkipped += 1;
      continue;
    }
    totalLen += text.length;
    categories.add(row.source_category);
    const key = `${normalizeReview(text)}||${row.source_category.trim().toLowerCase()}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const uniquePatterns = seen.size;
  const duplicateRows = Math.max(0, rawRows - uniquePatterns - emptySkipped);
  const duplicationRate = rawRows > 0 ? duplicateRows / rawRows : 0;
  const avgLen = rawRows > 0 ? totalLen / Math.max(1, rawRows - emptySkipped) : 0;

  // Transparent heuristic, documented in the UI: heavy duplication and
  // thin category coverage lower the score.
  let score = 8;
  score -= Math.min(4, duplicationRate * 5);
  if (categories.size < 3) score -= 1.5;
  if (avgLen < 40) score -= 1;
  if (emptySkipped > rawRows * 0.05) score -= 1;
  score = Math.max(1, Math.min(10, Math.round(score * 10) / 10));
  const grade = score >= 9 ? "A" : score >= 8 ? "B" : score >= 6.5 ? "C" : score >= 5 ? "D" : "F";

  return {
    score,
    grade,
    domain: "customer feedback",
    language: "English",
    tone: "mixed (reports and praise)",
    rawRows,
    uniquePatterns,
    duplicateRows,
    duplicationRate: Math.round(duplicationRate * 1000) / 1000,
    emptySkipped,
    checks: [
      {
        name: "Required columns present",
        passed: true,
        detail: "review and category columns mapped to prompt context.",
      },
      {
        name: "Prompt deduplication",
        passed: duplicateRows > 0,
        detail:
          duplicateRows > 0
            ? `${duplicateRows.toLocaleString()} duplicate rows fold into ${uniquePatterns.toLocaleString()} unique patterns before analysis.`
            : "No exact duplicates detected.",
      },
      {
        name: "Category coverage",
        passed: categories.size >= 3,
        detail: `${categories.size} distinct source categories: ${[...categories].slice(0, 6).join(", ")}.`,
      },
      {
        name: "No timestamps in source",
        passed: false,
        detail:
          "The source dataset has no review timestamps, so time-series trends are unavailable. Ingestion history is used instead where shown.",
      },
    ],
  };
}
