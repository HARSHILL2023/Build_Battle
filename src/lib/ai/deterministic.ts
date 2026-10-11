import { TOPICS } from "./topics";

export type Sentiment = "positive" | "neutral" | "negative";

export interface AnalysisResult {
  sentiment: Sentiment;
  topics: string[];
}

const POSITIVE_WORDS = [
  "great", "excellent", "helpful", "resolved", "exceeded", "perfect", "love",
  "innovative", "useful", "easy", "user-friendly", "prompt", "promptly",
  "transparent", "responsive", "wonderful", "amazing", "best", "satisfied",
  "happy", "pleased", "smooth", "quick", "quickly", "efficient", "kind",
  "friendly", " outstanding", "fantastic", "glad",
];

const NEGATIVE_WORDS = [
  "disappointed", "unresponsive", "not helpful", "did not", "never", "scam",
  "scammed", "fraud", "fraudulent", "fake", "counterfeit", "victim",
  "delayed", "late", "defect", "broken", "damaged", "missing", "wrong",
  "poor", "bad", "terrible", "awful", "worst", "crash", "crashing",
  "issues", "problem", "complaint", "angry", "frustrat", "upset",
  "additional payment", "took my money", "low-quality", "unsatisfactory",
];

function countHits(text: string, words: string[]): number {
  let n = 0;
  for (const w of words) {
    const word = w.trim();
    if (!word) continue;
    let idx = text.indexOf(word);
    while (idx !== -1) {
      n += 1;
      idx = text.indexOf(word, idx + word.length);
    }
  }
  return n;
}

/**
 * Deterministic keyword analyzer. Fast, offline, fully explainable.
 * Labeled everywhere in the UI as "Deterministic (keyword rules)",
 * never as an AI model.
 */
export function analyzeDeterministic(review: string): AnalysisResult {
  const text = ` ${review.toLowerCase()} `;
  const pos = countHits(text, POSITIVE_WORDS);
  const neg = countHits(text, NEGATIVE_WORDS);

  let sentiment: Sentiment;
  if (neg > pos) sentiment = "negative";
  else if (pos > neg + 1) sentiment = "positive";
  else sentiment = "neutral";

  const topics: string[] = [];
  for (const topic of TOPICS) {
    if (topic.keywords.some((k) => text.includes(k))) topics.push(topic.id);
  }
  if (topics.length === 0) topics.push(sentiment === "positive" ? "general-praise" : "product-quality");
  return { sentiment, topics: topics.slice(0, 3) };
}
