import { describe, expect, it } from "vitest";
import { hashReview, normalizeReview, sanitizeCsvCell, toCsvCell, truncate } from "@/lib/text";

describe("normalizeReview", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeReview("  Late   DELIVERY!! ")).toBe("late delivery");
  });

  it("treats quoted variants as identical", () => {
    expect(normalizeReview(`"damaged"`)).toBe(normalizeReview("damaged"));
  });
});

describe("hashReview", () => {
  it("is stable for identical pairs", () => {
    expect(hashReview("Late delivery", "Operational Issues")).toBe(
      hashReview("  late DELIVERY ", "operational issues")
    );
  });

  it("differs across categories", () => {
    expect(hashReview("Late delivery", "Operational Issues")).not.toBe(
      hashReview("Late delivery", "Product Feedback")
    );
  });
});

describe("CSV injection guard", () => {
  it("prefixes formula-leading cells", () => {
    expect(sanitizeCsvCell("=1+1")).toBe("'=1+1");
    expect(sanitizeCsvCell("+cmd")).toBe("'+cmd");
    expect(sanitizeCsvCell("-2")).toBe("'-2");
    expect(sanitizeCsvCell("@mention")).toBe("'@mention");
  });

  it("leaves normal cells untouched", () => {
    expect(sanitizeCsvCell("Great product")).toBe("Great product");
  });

  it("quotes cells containing commas or quotes", () => {
    expect(toCsvCell("a,b")).toBe('"a,b"');
    expect(toCsvCell('say "hi"')).toBe('"say ""hi"""');
  });
});

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("short", 10)).toBe("short");
  });

  it("shortens long text with an ellipsis", () => {
    const out = truncate("word ".repeat(50), 20);
    expect(out.length).toBeLessThanOrEqual(21);
    expect(out.endsWith("…")).toBe(true);
  });
});
