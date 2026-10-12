import { Feedback } from "../models/Feedback.js";
import { ImportRecord } from "../models/ImportRecord.js";
import { Issue } from "../models/Issue.js";
import { evaluateQuality } from "./adaption/localAdapter.js";
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

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const total = await Feedback.countDocuments();
  const uniquePatterns = (await Feedback.distinct("normHash")).length;
  const duplicateRecords = total - uniquePatterns;

  const statusRows = (await Feedback.aggregate([
    { $group: { _id: "$analysisStatus", n: { $sum: 1 } } },
  ])) as { _id: string; n: number }[];
  let analyzed = 0;
  let pending = 0;
  let failed = 0;
  for (const r of statusRows) {
    if (r._id === "analyzed") analyzed = r.n;
    else if (r._id === "failed") failed = r.n;
    else pending += r.n;
  }

  const sentimentRows = (await Feedback.aggregate([
    { $group: { _id: "$sentiment", n: { $sum: 1 } } },
  ])) as { _id: string | null; n: number }[];
  const sentiment = { positive: 0, neutral: 0, negative: 0, unanalyzed: 0 };
  for (const r of sentimentRows) {
    if (r._id === "positive") sentiment.positive = r.n;
    else if (r._id === "neutral") sentiment.neutral = r.n;
    else if (r._id === "negative") sentiment.negative = r.n;
    else sentiment.unanalyzed += r.n;
  }

  const byCategory = (
    (await Feedback.aggregate([
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
    ])) as { _id: string; total: number; negative: number; positive: number; neutral: number }[]
  ).map((r) => ({
    category: r._id,
    total: r.total,
    negative: r.negative ?? 0,
    positive: r.positive ?? 0,
    neutral: r.neutral ?? 0,
  }));

  const topPatterns = (
    (await Feedback.aggregate([
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
    ])) as { _id: string; review: string; category: string; count: number; sentiment: string | null }[]
  ).map((r) => ({ hash: r._id, review: r.review, category: r.category, count: r.count, sentiment: r.sentiment }));

  const topicRows = (await Feedback.find({ analysisStatus: "analyzed" })
    .select("topics sentiment normHash")
    .lean()) as { topics: string[]; sentiment: string | null; normHash: string }[];
  const topicMap = new Map<string, { raw: number; hashes: Set<string>; negative: number }>();
  for (const row of topicRows) {
    const topics = Array.isArray(row.topics) ? row.topics : [];
    for (const t of topics) {
      let acc = topicMap.get(t);
      if (!acc) {
        acc = { raw: 0, hashes: new Set(), negative: 0 };
        topicMap.set(t, acc);
      }
      acc.raw += 1;
      acc.hashes.add(row.normHash);
      if (row.sentiment === "negative") acc.negative += 1;
    }
  }
  const byTopic = [...topicMap.entries()]
    .map(([topic, v]) => ({ topic, label: topicLabel(topic), raw: v.raw, unique: v.hashes.size, negative: v.negative }))
    .sort((a, b) => b.raw - a.raw);

  const qualityRows = (await Feedback.find({}).select("reviewText sourceCategory").lean()) as {
    reviewText: string;
    sourceCategory: string;
  }[];
  const quality = evaluateQuality(
    qualityRows.map((r) => ({ review_text: r.reviewText, source_category: r.sourceCategory }))
  );

  const issueAgg = (await Issue.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        high: { $sum: { $cond: [{ $eq: ["$priorityBand", "high"] }, 1, 0] } },
        open: { $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] } },
      },
    },
  ])) as { total: number; high: number; open: number }[];
  const issueRows = issueAgg[0] ?? { total: 0, high: 0, open: 0 };

  const importCount = await ImportRecord.countDocuments();
  const lastImport = (await ImportRecord.findOne({}).sort({ sqliteId: -1 }).select("createdAt").lean()) as {
    createdAt?: Date;
  } | null;

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
