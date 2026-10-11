import { getDb } from "./db";
import { evaluateQuality } from "./adaption/localAdapter";
import { topicLabel } from "./ai/topics";

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

export function getDashboardMetrics(): DashboardMetrics {
  const database = getDb();

  const total = (database.prepare(`SELECT COUNT(*) AS n FROM feedback`).get() as { n: number }).n;
  const unique = (
    database.prepare(`SELECT COUNT(DISTINCT norm_hash) AS n FROM feedback`).get() as { n: number }
  ).n;
  const duplicateRecords = total - unique;

  const statusRows = database
    .prepare(`SELECT analysis_status AS s, COUNT(*) AS n FROM feedback GROUP BY s`)
    .all() as { s: string; n: number }[];
  let analyzed = 0,
    pending = 0,
    failed = 0;
  for (const r of statusRows) {
    if (r.s === "analyzed") analyzed = r.n;
    else if (r.s === "failed") failed = r.n;
    else pending += r.n;
  }

  const sentimentRows = database
    .prepare(`SELECT sentiment AS s, COUNT(*) AS n FROM feedback GROUP BY s`)
    .all() as { s: string | null; n: number }[];
  const sentiment = { positive: 0, neutral: 0, negative: 0, unanalyzed: 0 };
  for (const r of sentimentRows) {
    if (r.s === "positive") sentiment.positive = r.n;
    else if (r.s === "neutral") sentiment.neutral = r.n;
    else if (r.s === "negative") sentiment.negative = r.n;
    else sentiment.unanalyzed += r.n;
  }

  const byCategory = (
    database
      .prepare(
        `SELECT source_category AS category, COUNT(*) AS total,
                SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) AS negative,
                SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) AS positive,
                SUM(CASE WHEN sentiment = 'neutral' THEN 1 ELSE 0 END) AS neutral
         FROM feedback GROUP BY source_category ORDER BY total DESC`
      )
      .all() as {
      category: string;
      total: number;
      negative: number;
      positive: number;
      neutral: number;
    }[]
  ).map((r) => ({ ...r, negative: r.negative ?? 0, positive: r.positive ?? 0, neutral: r.neutral ?? 0 }));

  const topPatterns = database
    .prepare(
      `SELECT norm_hash AS hash, MIN(review_text) AS review, MIN(source_category) AS category,
              COUNT(*) AS count, MIN(sentiment) AS sentiment
       FROM feedback GROUP BY norm_hash ORDER BY count DESC LIMIT 10`
    )
    .all() as DashboardMetrics["topPatterns"];

  // Topic aggregation from stored per-row topic arrays.
  const topicRows = database
    .prepare(`SELECT topics, sentiment, norm_hash FROM feedback WHERE analysis_status = 'analyzed'`)
    .all() as { topics: string; sentiment: string | null; norm_hash: string }[];
  const topicMap = new Map<string, { raw: number; hashes: Set<string>; negative: number }>();
  for (const row of topicRows) {
    let topics: string[] = [];
    try {
      topics = JSON.parse(row.topics) as string[];
    } catch {
      continue;
    }
    for (const t of topics) {
      let acc = topicMap.get(t);
      if (!acc) {
        acc = { raw: 0, hashes: new Set(), negative: 0 };
        topicMap.set(t, acc);
      }
      acc.raw += 1;
      acc.hashes.add(row.norm_hash);
      if (row.sentiment === "negative") acc.negative += 1;
    }
  }
  const byTopic = [...topicMap.entries()]
    .map(([topic, v]) => ({ topic, label: topicLabel(topic), raw: v.raw, unique: v.hashes.size, negative: v.negative }))
    .sort((a, b) => b.raw - a.raw);

  const qualityRows = database
    .prepare(`SELECT review_text, source_category FROM feedback`)
    .all() as { review_text: string; source_category: string }[];
  const quality = evaluateQuality(qualityRows);

  const issueRows = database
    .prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN priority_band = 'high' THEN 1 ELSE 0 END) AS high, SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open FROM issues`)
    .get() as { total: number; high: number | null; open: number | null };

  const importCount = (database.prepare(`SELECT COUNT(*) AS n FROM imports`).get() as { n: number }).n;
  const lastImport = database.prepare(`SELECT created_at FROM imports ORDER BY id DESC LIMIT 1`).get() as
    | { created_at: string }
    | undefined;

  return {
    totalRecords: total,
    uniquePatterns: unique,
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
    lastImportAt: lastImport?.created_at ?? null,
    hasTimestamps: false,
  };
}
