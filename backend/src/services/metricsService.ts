import { Feedback } from "../models/Feedback.js";
import { ImportRecord } from "../models/ImportRecord.js";
import { Issue } from "../models/Issue.js";
import { buildQualityReport, type QualityStats } from "./adaption/localAdapter.js";
import { topicLabel } from "./topics.js";

export interface DashboardMetrics {
  totalRecords: number;
  uniquePatterns: number;
  duplicateRecords: number;
  duplicationRate: number;
  analyzed: number;
  pending: number;
  failed: number;
  sentiment: { positive: number; neutral: number; negative: number; unanalyzed: number };
  byCategory: { category: string; total: number; negative: number; positive: number; neutral: number }[];
  topPatterns: { hash: string; review: string; category: string; count: number; sentiment: string | null }[];
  byTopic: { topic: string; label: string; raw: number; unique: number; negative: number }[];
  quality: { score: number; grade: string };
  issues: { total: number; high: number; open: number };
  imports: number;
  lastImportAt: string | null;
  hasTimestamps: false;
}

// Workspace-global aggregates: identical for every authenticated session
// (demo and full accounts see the same dashboard), so a short process-local
// cache is safe. Writes invalidate it explicitly; the TTL is a backstop.
const METRICS_TTL_MS = 30_000;
let cached: { expiresAt: number; data: DashboardMetrics } | null = null;

/** Drop the cached dashboard metrics after any workspace write. */
export function invalidateMetrics(): void {
  cached = null;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.data;
  const data = await computeDashboardMetrics();
  cached = { expiresAt: Date.now() + METRICS_TTL_MS, data };
  return data;
}

/**
 * Quality inputs computed inside MongoDB instead of transferring every
 * review text to Node. The normalization mirrors normalizeReview exactly:
 * lowercase, quote stripping, and non-alphanumeric separators all become
 * single-space-joined [a-z0-9] tokens, so dedup keys match the row-scanning
 * path. Lengths use code points ($strLenCP), which equal UTF-16 lengths
 * except for astral-plane characters; the pinned seed test guards the
 * reported grade.
 */
export async function getQualityStats(): Promise<QualityStats> {
  const rows = (await Feedback.aggregate([
    {
      $project: {
        t: { $trim: { input: { $ifNull: ["$reviewText", ""] } } },
        c: "$sourceCategory",
      },
    },
    {
      $project: {
        t: 1,
        c: 1,
        empty: { $eq: ["$t", ""] },
        len: { $strLenCP: "$t" },
        tokens: {
          $map: {
            input: { $regexFindAll: { input: { $toLower: "$t" }, regex: "[a-z0-9]+" } },
            in: "$$this.match",
          },
        },
      },
    },
    {
      $project: {
        empty: 1,
        len: 1,
        c: 1,
        key: {
          $concat: [
            {
              $reduce: {
                input: "$tokens",
                initialValue: "",
                in: { $concat: ["$$value", { $cond: [{ $eq: ["$$value", ""] }, "", " "] }, "$$this"] },
              },
            },
            "||",
            { $toLower: { $trim: { input: { $ifNull: ["$c", ""] } } } },
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        rawRows: { $sum: 1 },
        emptySkipped: { $sum: { $cond: ["$empty", 1, 0] } },
        totalLen: { $sum: { $cond: ["$empty", 0, "$len"] } },
        categories: { $addToSet: { $cond: ["$empty", null, "$c"] } },
        keys: { $addToSet: { $cond: ["$empty", null, "$key"] } },
      },
    },
  ])) as {
    rawRows: number;
    emptySkipped: number;
    totalLen: number;
    categories: (string | null)[];
    keys: (string | null)[];
  }[];
  const agg = rows[0];
  if (!agg) {
    return { rawRows: 0, emptySkipped: 0, totalLen: 0, categories: [], uniquePatterns: 0, duplicateRows: 0 };
  }
  const categories = agg.categories.filter((c): c is string => c !== null);
  const keys = agg.keys.filter((k): k is string => k !== null);
  const uniquePatterns = keys.length;
  return {
    rawRows: agg.rawRows,
    emptySkipped: agg.emptySkipped,
    totalLen: agg.totalLen,
    categories,
    uniquePatterns,
    duplicateRows: Math.max(0, agg.rawRows - uniquePatterns - agg.emptySkipped),
  };
}

async function computeDashboardMetrics(): Promise<DashboardMetrics> {
  // Every read below is independent: one parallel wave instead of eleven
  // sequential round trips.
  const [
    total,
    uniqueAgg,
    statusRows,
    sentimentRows,
    categoryRows,
    patternRows,
    topicRows,
    qualityStats,
    issueAgg,
    importCount,
    lastImport,
  ] = await Promise.all([
    Feedback.countDocuments(),
    Feedback.aggregate([{ $group: { _id: "$normHash" } }, { $count: "n" }]) as Promise<{ n: number }[]>,
    Feedback.aggregate([{ $group: { _id: "$analysisStatus", n: { $sum: 1 } } }]) as Promise<
      { _id: string; n: number }[]
    >,
    Feedback.aggregate([{ $group: { _id: "$sentiment", n: { $sum: 1 } } }]) as Promise<
      { _id: string | null; n: number }[]
    >,
    Feedback.aggregate([
      {
        $group: {
          _id: "$sourceCategory",
          total: { $sum: 1 },
          negative: { $sum: { $cond: [{ $eq: ["$sentiment", "negative"] }, 1, 0] } },
          positive: { $sum: { $cond: [{ $eq: ["$sentiment", "positive"] }, 1, 0] } },
          neutral: { $sum: { $cond: [{ $eq: ["$sentiment", "neutral"] }, 1, 0] } },
        },
      },
      { $sort: { total: -1 } },
    ]) as Promise<{ _id: string; total: number; negative: number; positive: number; neutral: number }[]>,
    Feedback.aggregate([
      {
        $group: {
          _id: "$normHash",
          review: { $min: "$reviewText" },
          category: { $min: "$sourceCategory" },
          count: { $sum: 1 },
          sentiment: { $min: "$sentiment" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]) as Promise<{ _id: string; review: string; category: string; count: number; sentiment: string | null }[]>,
    Feedback.aggregate([
      { $match: { analysisStatus: "analyzed" } },
      { $unwind: "$topics" },
      {
        $group: {
          _id: "$topics",
          raw: { $sum: 1 },
          hashes: { $addToSet: "$normHash" },
          negative: { $sum: { $cond: [{ $eq: ["$sentiment", "negative"] }, 1, 0] } },
        },
      },
      { $sort: { raw: -1 } },
    ]) as Promise<{ _id: string; raw: number; hashes: string[]; negative: number }[]>,
    getQualityStats(),
    Issue.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          high: { $sum: { $cond: [{ $eq: ["$priorityBand", "high"] }, 1, 0] } },
          open: { $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] } },
        },
      },
    ]) as Promise<{ total: number; high: number; open: number }[]>,
    ImportRecord.countDocuments(),
    ImportRecord.findOne({}).sort({ sqliteId: -1 }).select("createdAt").lean() as Promise<{
      createdAt?: Date;
    } | null>,
  ]);

  const uniquePatterns = uniqueAgg[0]?.n ?? 0;
  const duplicateRecords = total - uniquePatterns;

  let analyzed = 0;
  let pending = 0;
  let failed = 0;
  for (const r of statusRows) {
    if (r._id === "analyzed") analyzed = r.n;
    else if (r._id === "failed") failed = r.n;
    else pending += r.n;
  }

  const sentiment = { positive: 0, neutral: 0, negative: 0, unanalyzed: 0 };
  for (const r of sentimentRows) {
    if (r._id === "positive") sentiment.positive = r.n;
    else if (r._id === "neutral") sentiment.neutral = r.n;
    else if (r._id === "negative") sentiment.negative = r.n;
    else sentiment.unanalyzed += r.n;
  }

  const byCategory = categoryRows.map((r) => ({
    category: r._id,
    total: r.total,
    negative: r.negative ?? 0,
    positive: r.positive ?? 0,
    neutral: r.neutral ?? 0,
  }));

  const topPatterns = patternRows.map((r) => ({
    hash: r._id,
    review: r.review,
    category: r.category,
    count: r.count,
    sentiment: r.sentiment,
  }));

  const byTopic = topicRows.map((r) => ({
    topic: r._id,
    label: topicLabel(r._id),
    raw: r.raw,
    unique: r.hashes.length,
    negative: r.negative,
  }));

  const quality = buildQualityReport(qualityStats);
  const issueRows = issueAgg[0] ?? { total: 0, high: 0, open: 0 };

  return {
    totalRecords: total,
    uniquePatterns,
    duplicateRecords,
    duplicationRate: total > 0 ? Math.round((duplicateRecords / total) * 1000) / 1000 : 0,
    analyzed,
    pending,
    failed,
    sentiment,
    byCategory,
    topPatterns,
    byTopic,
    quality: { score: quality.score, grade: quality.grade },
    issues: {
      total: issueRows.total ?? 0,
      high: issueRows.high ?? 0,
      open: issueRows.open ?? 0,
    },
    imports: importCount,
    lastImportAt: lastImport?.createdAt ? new Date(lastImport.createdAt).toISOString() : null,
    hasTimestamps: false,
  };
}
