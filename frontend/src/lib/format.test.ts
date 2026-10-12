import { describe, expect, it } from "vitest";
import { timeAgo } from "./format";

describe("timeAgo", () => {
  it("formats MongoDB ISO timestamps with a zone designator", () => {
    const iso = new Date(Date.now() - 22 * 3_600_000).toISOString();
    expect(timeAgo(iso)).toMatch(/ago|just now/);
    expect(timeAgo(iso)).not.toContain("T");
  });

  it("formats legacy SQLite timestamps without a designator", () => {
    expect(timeAgo("2026-10-11 05:55:47")).toMatch(/ago/);
  });

  it("handles null and garbage honestly", () => {
    expect(timeAgo(null)).toBe("never");
    expect(timeAgo("not-a-date")).toBe("not-a-date");
  });
});
