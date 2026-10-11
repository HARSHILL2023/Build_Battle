import { describe, expect, it } from "vitest";
import { analyzeDeterministic } from "@/lib/ai/deterministic";
import { TOPICS } from "@/lib/ai/topics";

describe("analyzeDeterministic", () => {
  it("marks clear complaints negative", () => {
    const r = analyzeDeterministic(
      "I was scammed by a fraudulent seller, they took my money and never sent the product."
    );
    expect(r.sentiment).toBe("negative");
    expect(r.topics).toContain("fraud-scam");
  });

  it("marks clear praise positive", () => {
    const r = analyzeDeterministic(
      "Customer service was incredibly helpful and resolved my issue within minutes."
    );
    expect(r.sentiment).toBe("positive");
  });

  it("marks mixed resolved reports neutral", () => {
    const r = analyzeDeterministic(
      "The product arrived with some defects, but the seller was responsive and provided a replacement."
    );
    expect(r.sentiment).toBe("neutral");
  });

  it("always returns 1-3 known topic ids", () => {
    const ids = new Set(TOPICS.map((t) => t.id));
    const r = analyzeDeterministic("The delivery was delayed and the box was damaged.");
    expect(r.topics.length).toBeGreaterThanOrEqual(1);
    expect(r.topics.length).toBeLessThanOrEqual(3);
    for (const t of r.topics) expect(ids.has(t)).toBe(true);
  });

  it("never invents confidence or labels outside the taxonomy", () => {
    const r = analyzeDeterministic("Meh. It arrived.");
    expect(["positive", "neutral", "negative"]).toContain(r.sentiment);
    expect("confidence" in r).toBe(false);
  });
});
