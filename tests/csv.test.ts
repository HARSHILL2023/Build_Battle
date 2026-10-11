import { describe, expect, it } from "vitest";
import { parseFeedbackCsv } from "@/lib/csv";

const HEADER = "review,category\n";

describe("parseFeedbackCsv", () => {
  it("parses valid rows and hashes them", () => {
    const res = parseFeedbackCsv(`${HEADER}Great product,Product Feedback\n`, "t.csv");
    expect(res.errors).toHaveLength(0);
    expect(res.valid).toHaveLength(1);
    expect(res.valid[0].category).toBe("Product Feedback");
    expect(res.valid[0].hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects files without required headers", () => {
    const res = parseFeedbackCsv("name,age\nAlice,30\n", "t.csv");
    expect(res.valid).toHaveLength(0);
    expect(res.errors[0].message).toMatch(/review.*category/);
  });

  it("accepts case-insensitive headers and ignores extra columns", () => {
    const res = parseFeedbackCsv("REVIEW,Category,extra\nHello,Other,x\n", "t.csv");
    expect(res.valid).toHaveLength(1);
  });

  it("flags empty reviews and oversized text", () => {
    const long = "x".repeat(2001);
    const res = parseFeedbackCsv(`${HEADER},Other\n${long},Other\n`, "t.csv");
    expect(res.valid).toHaveLength(0);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("maps unknown categories to Other instead of dropping rows", () => {
    const res = parseFeedbackCsv(`${HEADER}Fine,Shipping\n`, "t.csv");
    expect(res.valid).toHaveLength(1);
    expect(res.valid[0].category).toBe("Other");
  });

  it("rejects oversized files without parsing", () => {
    const big = `review,category\n${"x".padEnd(9 * 1024 * 1024, "y")},Other\n`;
    const res = parseFeedbackCsv(big, "big.csv");
    expect(res.valid).toHaveLength(0);
    expect(res.errors[0].message).toMatch(/too large/i);
  });

  it("reports unparseable content", () => {
    const res = parseFeedbackCsv("", "empty.csv");
    expect(res.valid).toHaveLength(0);
    expect(res.errors.length).toBeGreaterThan(0);
  });
});
