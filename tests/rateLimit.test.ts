import { describe, expect, it } from "vitest";
import { checkRateLimit } from "@/lib/rateLimit";

describe("checkRateLimit", () => {
  it("allows up to the limit within a window", () => {
    const key = `test-${Date.now()}-a`;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, 3, 60_000).ok).toBe(true);
    }
    const blocked = checkRateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("resets after the window expires", async () => {
    const key = `test-${Date.now()}-b`;
    expect(checkRateLimit(key, 1, 30).ok).toBe(true);
    expect(checkRateLimit(key, 1, 30).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    expect(checkRateLimit(key, 1, 30).ok).toBe(true);
  });

  it("tracks keys independently", () => {
    const a = `test-${Date.now()}-c1`;
    const b = `test-${Date.now()}-c2`;
    expect(checkRateLimit(a, 1, 60_000).ok).toBe(true);
    expect(checkRateLimit(a, 1, 60_000).ok).toBe(false);
    expect(checkRateLimit(b, 1, 60_000).ok).toBe(true);
  });
});
