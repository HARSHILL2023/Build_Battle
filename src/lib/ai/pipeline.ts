import {
  createAnalysisRun,
  finishAnalysisRun,
  getDb,
  logAdaptionRun,
  markAnalysisFailed,
  replaceAutoIssues,
  updateAnalysisByHash,
  type IssueRow,
} from "../db";
import { getAdaptionConfig } from "../adaption/client";
import { evaluateQuality, prepareForAnalysis } from "../adaption/localAdapter";
import { analyzeDeterministic } from "./deterministic";
import { analyzeBatchOpenAI, isOpenAIConfigured, openAIModelName } from "./openaiProvider";
import { topicById } from "./topics";

export type AnalysisMethod = "auto" | "openai" | "deterministic";

export interface PipelineSummary {
  runId: number;
  method: string;
  adaptionMode: "live" | "local-adapter";
  rawRows: number;
  uniquePatterns: number;
  duplicateRows: number;
  succeeded: number;
  failed: number;
  rowsUpdated: number;
  issuesCreated: number;
  qualityScore: number;
  qualityGrade: string;
  providerError: string | null;
}

interface UniquePattern {
  norm_hash: string;
  review_text: string;
  source_category: string;
  row_count: number;
}

/**
 * Full analysis pipeline:
 * 1. Adaption preparation (dedup + quality evaluation, live or local).
 * 2. Sentiment + topic classification of each UNIQUE pattern once.
 * 3. Result fan-out to every row sharing the pattern hash.
 * 4. Evidence-backed issue regeneration.
 */
export async function runAnalysisPipeline(
  method: AnalysisMethod = "auto",
  onlyPending = false
): Promise<PipelineSummary> {
  const database = getDb();
  const adaptionConfig = getAdaptionConfig();

  const patternRows = database
    .prepare(
      `SELECT norm_hash, MIN(review_text) AS review_text, MIN(source_category) AS source_category,
              COUNT(*) AS row_count
       FROM feedback
       ${onlyPending ? "WHERE analysis_status = 'pending'" : ""}
       GROUP BY norm_hash
       ORDER BY row_count DESC`
    )
    .all() as UniquePattern[];

  const rawRows = (
    database
      .prepare(
        `SELECT COUNT(*) AS n FROM feedback ${onlyPending ? "WHERE analysis_status = 'pending'" : ""}`
      )
      .get() as { n: number }
  ).n;

  // Step 1: Adaption preparation. Without credentials this runs the
  // local adapter, which is recorded honestly as "local-adapter".
  const allRows = database
    .prepare(`SELECT review_text, source_category, norm_hash FROM feedback`)
    .all() as { review_text: string; source_category: string; norm_hash: string }[];
  const prep = prepareForAnalysis(allRows);
  const quality = evaluateQuality(allRows);
  const adaptionMode: "live" | "local-adapter" = adaptionConfig.configured ? "live" : "local-adapter";
  logAdaptionRun("prepare", adaptionMode, prep.rawRows, "completed", {
    universalPrompt: "sentiment + topic classification prompt",
    columnRoles: { prompt: "universal classification prompt", context: "review", completion: "generated" },
    uniquePatterns: prep.uniquePatterns,
    duplicateRows: prep.duplicateRows,
    qualityScore: quality.score,
    qualityGrade: quality.grade,
    note: adaptionConfig.configured
      ? "Live Adaption credentials configured. Local preparation ran first; use Settings to verify the live connection."
      : "ADAPTION_API_KEY not set. Local preparation adapter used; downstream analysis consumed its deduplicated output.",
  });

  // Step 2: classify each unique pattern once.
  const useOpenAI = method === "openai" || (method === "auto" && isOpenAIConfigured());
  const providerName = useOpenAI ? `openai:${openAIModelName()}` : "deterministic:keyword-rules-v1";
  const runId = createAnalysisRun(providerName, patternRows.length);

  let succeeded = 0;
  let failed = 0;
  let rowsUpdated = 0;
  let providerError: string | null = null;

  if (useOpenAI) {
    const texts = patternRows.map((p) => p.review_text);
    const batch = await analyzeBatchOpenAI(texts);
    providerError = batch.error;
    const batchResults = batch.results;
    patternRows.forEach((pattern, i) => {
      const result = batchResults.get(i);
      if (!result) {
        // Fall back per-item so one provider failure never blocks the run.
        const fallback = analyzeDeterministic(pattern.review_text);
        rowsUpdated += updateAnalysisByHash(
          pattern.norm_hash,
          fallback.sentiment,
          "deterministic:keyword-rules-v1 (openai fallback)",
          fallback.topics
        );
        failed += 1;
        return;
      }
      rowsUpdated += updateAnalysisByHash(pattern.norm_hash, result.sentiment, providerName, result.topics);
      succeeded += 1;
    });
  } else {
    for (const pattern of patternRows) {
      try {
        const result = analyzeDeterministic(pattern.review_text);
        rowsUpdated += updateAnalysisByHash(pattern.norm_hash, result.sentiment, providerName, result.topics);
        succeeded += 1;
      } catch {
        markAnalysisFailed(pattern.norm_hash);
        failed += 1;
      }
    }
  }

  finishAnalysisRun(runId, succeeded, failed, rowsUpdated, {
    adaptionMode,
    qualityScore: quality.score,
    provider: providerName,
    providerError: useOpenAI ? providerError : null,
  });

  // Step 3: regenerate evidence-backed issues.
  const issuesCreated = rebuildIssues();

  return {
    runId,
    method: providerName,
    adaptionMode,
    rawRows,
    uniquePatterns: patternRows.length,
    duplicateRows: rawRows - patternRows.length,
    succeeded,
    failed,
    rowsUpdated,
    issuesCreated,
    qualityScore: quality.score,
    qualityGrade: quality.grade,
    providerError,
  };
}

interface ClusterAcc {
  primaryTopic: string;
  category: string;
  raw: number;
  unique: number;
  negative: number;
  positive: number;
  neutral: number;
  evidence: { id: number; count: number; text: string }[];
}

const RECOMMENDATIONS: Record<string, string> = {
  "fraud-scam":
    "Escalate to trust and safety. Audit flagged sellers, hold payouts for accounts tied to these reports, and add a purchase-time warning about payments outside the platform.",
  "product-quality":
    "Start a quality review with the suppliers behind the most repeated complaints. Require photo evidence on arrival-damage claims and track replacement rates weekly.",
  delivery:
    "Review carrier performance on the affected lanes and set an explicit delivery promise at checkout. Proactively notify buyers when a delay is detected.",
  "customer-support":
    "Audit recent support conversations for first-response time and resolution rate. Publish a staffing plan for peak hours and add macros for the most common complaints.",
  "website-ordering":
    "Reproduce the reported checkout and stability problems on the top browsers, then fix the highest-frequency failure first and confirm with a follow-up survey.",
  packaging:
    "Change the packing checklist for the items most often reported missing or damaged, and add a weight or photo check before dispatch.",
  "pricing-payment":
    "Review every flow that requests extra payment after checkout. Remove or clearly disclose legitimate fees and block sellers misusing additional charges.",
  "replacement-resolution":
    "Measure how often replacements actually resolve the complaint. Where rates are low, switch the default remedy to refund plus re-shipment choice.",
  "seller-responsiveness":
    "Set a response-time expectation for sellers and surface it on listings. Coach or throttle sellers that repeatedly miss it.",
  "general-praise":
    "Protect what is working. Identify the teams or sellers behind the praise and document their practice as the standard.",
};

/**
 * Transparent prioritization. Score = 45% relative frequency +
 * 35% negative share + 20% topic severity. Bands: 70+ high,
 * 40+ medium, else low. Everything is derived from stored rows.
 */
function rebuildIssues(): number {
  const database = getDb();
  const rows = database
    .prepare(
      `SELECT f.id, f.review_text, f.source_category, f.norm_hash, f.sentiment, f.topics,
              (SELECT COUNT(*) FROM feedback g WHERE g.norm_hash = f.norm_hash) AS pattern_count
       FROM feedback f
       WHERE f.analysis_status = 'analyzed'`
    )
    .all() as {
    id: number;
    review_text: string;
    source_category: string;
    norm_hash: string;
    sentiment: string | null;
    topics: string;
    pattern_count: number;
  }[];

  const clusters = new Map<string, ClusterAcc>();
  const seenHash = new Set<string>();
  for (const row of rows) {
    let topics: string[] = [];
    try {
      topics = JSON.parse(row.topics) as string[];
    } catch {
      topics = [];
    }
    const primaryTopic = topics[0] ?? "product-quality";
    const key = `${primaryTopic}||${row.source_category}`;
    let acc = clusters.get(key);
    if (!acc) {
      acc = {
        primaryTopic,
        category: row.source_category,
        raw: 0,
        unique: 0,
        negative: 0,
        positive: 0,
        neutral: 0,
        evidence: [],
      };
      clusters.set(key, acc);
    }
    acc.raw += 1;
    if (!seenHash.has(`${key}||${row.norm_hash}`)) {
      seenHash.add(`${key}||${row.norm_hash}`);
      acc.unique += 1;
      acc.evidence.push({ id: row.id, count: row.pattern_count, text: row.review_text });
    }
    if (row.sentiment === "negative") acc.negative += 1;
    else if (row.sentiment === "positive") acc.positive += 1;
    else acc.neutral += 1;
  }

  const clusterList = [...clusters.values()].filter((c) => c.raw > 0);
  const maxRaw = Math.max(1, ...clusterList.map((c) => c.raw));

  const issues: Omit<IssueRow, "id" | "created_at" | "updated_at">[] = clusterList.map((c) => {
    const topic = topicById(c.primaryTopic);
    const negShare = c.raw > 0 ? c.negative / c.raw : 0;
    const freqScore = (c.raw / maxRaw) * 100;
    const score = Math.round(freqScore * 0.45 + negShare * 100 * 0.35 + (topic?.severity ?? 40) * 0.2);
    const band = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
    const topEvidence = [...c.evidence].sort((a, b) => b.count - a.count).slice(0, 3);
    const label = topic?.label ?? c.primaryTopic;
    return {
      title: `${label} in ${c.category}`,
      description:
        `${c.raw.toLocaleString()} feedback records (${c.unique.toLocaleString()} unique patterns) ` +
        `point to ${label.toLowerCase()} within ${c.category}. ` +
        `${c.negative.toLocaleString()} are negative, ${c.positive.toLocaleString()} positive, ${c.neutral.toLocaleString()} neutral.`,
      category: c.category,
      primary_topic: c.primaryTopic,
      frequency_raw: c.raw,
      frequency_unique: c.unique,
      negative_count: c.negative,
      priority_score: score,
      priority_band: band,
      priority_explanation:
        `Score ${score}/100 = 45% relative frequency (${c.raw.toLocaleString()} records vs ` +
        `${maxRaw.toLocaleString()} for the largest issue) + 35% negative share ` +
        `(${Math.round(negShare * 100)}%) + 20% severity (${topic?.severity ?? 40}/100 for ${label.toLowerCase()}).`,
      recommendation: RECOMMENDATIONS[c.primaryTopic] ?? "Investigate the supporting feedback and define an owner and next step.",
      evidence_ids: JSON.stringify(topEvidence.map((e) => e.id)),
      status: "open",
      auto_generated: 1,
    };
  });

  issues.sort((a, b) => b.priority_score - a.priority_score);
  replaceAutoIssues(issues);
  return issues.length;
}
