import OpenAI from "openai";
import { TOPICS } from "./topics.js";
import type { AnalysisResult, Sentiment } from "./deterministic.js";

const MODEL = "gpt-4o-mini";
const BATCH_SIZE = 25;

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function topicListForPrompt(): string {
  return TOPICS.map((t) => `- ${t.id}: ${t.label}`).join("\n");
}

interface OpenAIItemResult {
  sentiment?: string;
  topics?: string[];
}

/**
 * Batched OpenAI sentiment + topic classification over unique review
 * texts. Each unique text is sent exactly once; rows sharing a hash
 * reuse the result. No confidence scores are fabricated: the provider
 * returns labels only, and only labels are stored.
 *
 * The human-readable `error` is returned (not thrown) so the caller can
 * record exactly why items fell back, and the UI can explain it.
 */
export async function analyzeBatchOpenAI(
  texts: string[]
): Promise<{ results: Map<number, AnalysisResult | null>; error: string | null }> {
  const results = new Map<number, AnalysisResult | null>();
  if (!isOpenAIConfigured()) {
    texts.forEach((_, i) => results.set(i, null));
    return { results, error: "OPENAI_API_KEY is not set." };
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const validTopicIds = new Set(TOPICS.map((t) => t.id));
  let firstError: string | null = null;

  // A small worker pool bounds worst-case latency: with a hanging
  // network, sequential batches would stack per-attempt timeouts and
  // leave the UI waiting for minutes. Four concurrent batches keep a
  // full-dataset run inside a reasonable budget.
  const CONCURRENCY = 4;
  const batchCount = Math.ceil(texts.length / BATCH_SIZE);
  let nextBatch = 0;

  async function runBatch(batchIndex: number): Promise<void> {
    const start = batchIndex * BATCH_SIZE;
    const batch = texts.slice(start, start + BATCH_SIZE);
    const prompt =
      `Classify each customer feedback item. Return a JSON object with key "items", an array in the same order, ` +
      `each item: {"sentiment": "positive"|"neutral"|"negative", "topics": ["<topic-id>", ...]}. ` +
      `Use 1-3 topic ids from this list:\n${topicListForPrompt()}\n` +
      `Sentiment rules: "negative" reports a problem or dissatisfaction; "positive" expresses satisfaction with no unresolved complaint; ` +
      `"neutral" is mixed, resolved, or purely factual. Feedback items:\n` +
      batch.map((t, i) => `${i + 1}. ${t.slice(0, 600)}`).join("\n");

    let parsed: { items?: OpenAIItemResult[] } | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await client.chat.completions.create(
          {
            model: MODEL,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: "You are a careful customer-feedback classifier. Reply with valid JSON only.",
              },
              { role: "user", content: prompt },
            ],
          },
          { timeout: 25_000 }
        );
        const content = response.choices[0]?.message?.content ?? "{}";
        parsed = JSON.parse(content) as { items?: OpenAIItemResult[] };
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        // Retry only transient failures. Authentication, billing, and
        // malformed-request errors (4xx) will never succeed on retry,
        // so fail fast and let the caller fall back with an explanation.
        const status = (err as { status?: number })?.status;
        const retryable = status === undefined || status === 429 || status >= 500;
        if (!retryable || attempt === 2) break;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    if (!parsed || !Array.isArray(parsed.items)) {
      const reason = lastError instanceof Error ? lastError.message : String(lastError);
      console.error("OpenAI batch failed:", lastError);
      if (!firstError) firstError = reason;
      batch.forEach((_, i) => results.set(start + i, null));
      return;
    }
    batch.forEach((_, i) => {
      const item = parsed!.items![i];
      const sentiment = (item?.sentiment ?? "").toLowerCase();
      const topics = Array.isArray(item?.topics)
        ? item.topics.filter((t) => validTopicIds.has(t)).slice(0, 3)
        : [];
      if (sentiment !== "positive" && sentiment !== "neutral" && sentiment !== "negative") {
        results.set(start + i, null);
        return;
      }
      results.set(start + i, {
        sentiment: sentiment as Sentiment,
        topics: topics.length > 0 ? topics : ["product-quality"],
      });
    });
  }

  async function worker(): Promise<void> {
    while (true) {
      const batchIndex = nextBatch++;
      if (batchIndex >= batchCount) return;
      await runBatch(batchIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, Math.max(1, batchCount)) }, () => worker())
  );
  return { results, error: firstError };
}

export function openAIModelName(): string {
  return MODEL;
}
