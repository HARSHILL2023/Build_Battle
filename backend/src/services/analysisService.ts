import { Feedback } from "../models/Feedback.js";
import { AnalysisRun } from "../models/AnalysisRun.js";
import { AdaptionRun } from "../models/AdaptionRun.js";
import { Issue } from "../models/Issue.js";
import { reserveSeq } from "../utils/seq.js";
import { getAdaptionConfig } from "./adaption/client.js";
import { evaluateQuality, prepareForAnalysis } from "./adaption/localAdapter.js";
import { analyzeDeterministic } from "./deterministic.js";
import { analyzeBatchOpenAI, isOpenAIConfigured, openAIModelName } from "./openaiProvider.js";
import { topicById } from "./topics.js";

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
  _id: string;
  reviewText: string;
  sourceCategory: string;
  rowCount: number;
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
  const adaptionConfig = getAdaptionConfig();
  const statusFilter = onlyPending ? { analysisStatus: "pending" } : {};

  const patternRows = (await Feedback.aggregate([
    { $match: statusFilter },
    {
      $group: {
        _id: "$normHash",
        reviewText: { $min: "$reviewText" },
        sourceCategory: { $min: "$sourceCategory" },
        rowCount: { $sum: 1 },
      },
    },
    { $sort: { rowCount: -1 } },
  ])) as UniquePattern[];

  const rawRows = await Feedback.countDocuments(statusFilter);

  // Step 1: Adaption preparation. Without credentials this runs the
  // local adapter, which is recorded honestly as "local-adapter".
  const allRows = (await Feedback.find({}).select("reviewText sourceCategory normHash").lean()) as {
    reviewText: string;
    sourceCategory: string;
    normHash: string;
  }[];
  const prepInput = allRows.map((r) => ({
    review_text: r.reviewText,
    source_category: r.sourceCategory,
    norm_hash: r.normHash,
  }));
  const prep = prepareForAnalysis(prepInput);
  const quality = evaluateQuality(prepInput);
  const adaptionMode: "live" | "local-adapter" = adaptionConfig.configured ? "live" : "local-adapter";
  await AdaptionRun.create({
    operation: "prepare",
    mode: adaptionMode,
    inputRows: prep.rawRows,
    status: "completed",
    summary: {
      universalPrompt: "sentiment + topic classification prompt",
      columnRoles: { prompt: "universal classification prompt", context: "review", completion: "generated" },
      uniquePatterns: prep.uniquePatterns,
      duplicateRows: prep.duplicateRows,
      qualityScore: quality.score,
      qualityGrade: quality.grade,
      note: adaptionConfig.configured
        ? "Live Adaption credentials configured. Local preparation ran first; use Settings to verify the live connection."
        : "ADAPTION_API_KEY not set. Local preparation adapter used; downstream analysis consumed its deduplicated output.",
    },
  });

  // Step 2: classify each unique pattern once.
  const useOpenAI = method === "openai" || (method === "auto" && isOpenAIConfigured());
  const providerName = useOpenAI ? `openai:${openAIModelName()}` : "deterministic:keyword-rules-v1";
  const runSqliteId = await reserveSeq("analysisrun", 1);
  const run = await AnalysisRun.create({ method: providerName, totalUnique: patternRows.length, sqliteId: runSqliteId });

  let succeeded = 0;
  let failed = 0;
  let rowsUpdated = 0;
  let providerError: string | null = null;

  if (useOpenAI) {
    const texts = patternRows.map((p) => p.reviewText);
    const batch = await analyzeBatchOpenAI(texts);
    providerError = batch.error;
    const batchResults = batch.results;
    for (let i = 0; i < patternRows.length; i++) {
      const pattern = patternRows[i];
      const result = batchResults.get(i);
      if (!result) {
        // Fall back per-item so one provider failure never blocks the run.
        const fallback = analyzeDeterministic(pattern.reviewText);
        const res = await Feedback.updateMany(
          { normHash: pattern._id },
          {
            $set: {
              sentiment: fallback.sentiment,
              sentimentMethod: "deterministic:keyword-rules-v1 (openai fallback)",
              topics: fallback.topics,
              analysisStatus: "analyzed",
            },
          }
        );
        rowsUpdated += res.modifiedCount;
        failed += 1;
        continue;
      }
      const res = await Feedback.updateMany(
        { normHash: pattern._id },
        {
          $set: {
            sentiment: result.sentiment,
            sentimentMethod: providerName,
            topics: result.topics,
            analysisStatus: "analyzed",
          },
        }
      );
      rowsUpdated += res.modifiedCount;
      succeeded += 1;
    }
  } else {
    for (const pattern of patternRows) {
      try {
        const result = analyzeDeterministic(pattern.reviewText);
        const res = await Feedback.updateMany(
          { normHash: pattern._id },
          {
            $set: {
              sentiment: result.sentiment,
              sentimentMethod: providerName,
              topics: result.topics,
              analysisStatus: "analyzed",
            },
          }
        );
        rowsUpdated += res.modifiedCount;
        succeeded += 1;
      } catch {
        await Feedback.updateMany({ normHash: pattern._id }, { $set: { analysisStatus: "failed" } });
        failed += 1;
      }
    }
  }

  run.succeeded = succeeded;
  run.failed = failed;
  run.rowsUpdated = rowsUpdated;
  run.detail = {
    adaptionMode,
    qualityScore: quality.score,
    provider: providerName,
    providerError: useOpenAI ? providerError : null,
  };
  run.finishedAt = new Date();
  await run.save();

  // Step 3: regenerate evidence-backed issues.
  const issuesCreated = await rebuildIssues();

  return {
    runId: runSqliteId,
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
async function rebuildIssues(): Promise<number> {
  const rows = (await Feedback.find({ analysisStatus: "analyzed" })
    .select("sqliteId reviewText sourceCategory normHash sentiment topics")
    .lean()) as {
    sqliteId: number;
    reviewText: string;
    sourceCategory: string;
    normHash: string;
    sentiment: string | null;
    topics: string[];
  }[];

  const hashCounts = new Map<string, number>();
  for (const row of rows) hashCounts.set(row.normHash, (hashCounts.get(row.normHash) ?? 0) + 1);

  const clusters = new Map<string, ClusterAcc>();
  const seenHash = new Set<string>();
  for (const row of rows) {
    const topics = Array.isArray(row.topics) ? row.topics : [];
    const primaryTopic = topics[0] ?? "product-quality";
    const key = `${primaryTopic}||${row.sourceCategory}`;
    let acc = clusters.get(key);
    if (!acc) {
      acc = {
        primaryTopic,
        category: row.sourceCategory,
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
    if (!seenHash.has(`${key}||${row.normHash}`)) {
      seenHash.add(`${key}||${row.normHash}`);
      acc.unique += 1;
      acc.evidence.push({ id: row.sqliteId, count: hashCounts.get(row.normHash) ?? 1, text: row.reviewText });
    }
    if (row.sentiment === "negative") acc.negative += 1;
    else if (row.sentiment === "positive") acc.positive += 1;
    else acc.neutral += 1;
  }

  const clusterList = [...clusters.values()].filter((c) => c.raw > 0);
  const maxRaw = Math.max(1, ...clusterList.map((c) => c.raw));

  const built = clusterList.map((c) => {
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
      primaryTopic: c.primaryTopic,
      frequencyRaw: c.raw,
      frequencyUnique: c.unique,
      negativeCount: c.negative,
      priorityScore: score,
      priorityBand: band,
      priorityExplanation:
        `Score ${score}/100 = 45% relative frequency (${c.raw.toLocaleString()} records vs ` +
        `${maxRaw.toLocaleString()} for the largest issue) + 35% negative share ` +
        `(${Math.round(negShare * 100)}%) + 20% severity (${topic?.severity ?? 40}/100 for ${label.toLowerCase()}).`,
      recommendation: RECOMMENDATIONS[c.primaryTopic] ?? "Investigate the supporting feedback and define an owner and next step.",
      evidenceIds: topEvidence.map((e) => e.id),
      status: "open",
      autoGenerated: true,
    };
  });

  built.sort((a, b) => b.priorityScore - a.priorityScore);
  await replaceAutoIssues(built);
  return built.length;
}

interface BuiltIssue {
  title: string;
  description: string;
  category: string;
  primaryTopic: string;
  frequencyRaw: number;
  frequencyUnique: number;
  negativeCount: number;
  priorityScore: number;
  priorityBand: string;
  priorityExplanation: string;
  recommendation: string;
  evidenceIds: number[];
  status: string;
  autoGenerated: boolean;
}

async function replaceAutoIssues(issues: BuiltIssue[]): Promise<void> {
  // Preserve status of existing auto issues matched by title.
  const existing = (await Issue.find({ autoGenerated: true }).select("title status").lean()) as {
    title: string;
    status: string;
  }[];
  const statusByTitle = new Map(existing.map((e) => [e.title, e.status]));
  await Issue.deleteMany({ autoGenerated: true });
  if (issues.length === 0) return;
  const firstId = await reserveSeq("issue", issues.length);
  await Issue.insertMany(
    issues.map((issue, i) => ({
      ...issue,
      status: statusByTitle.get(issue.title) ?? issue.status,
      sqliteId: firstId + i,
    }))
  );
}
