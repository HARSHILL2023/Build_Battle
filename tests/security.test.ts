import { describe, expect, it } from "vitest";
import config from "../next.config";

/**
 * Regression test for the stuck-skeleton incident: the served CSP must
 * permit the inline <script> hydration payloads that Next.js App Router
 * emits. A strict script-src 'self' blocks hydration, leaving every
 * client-fetched page on its skeleton forever.
 */
describe("security headers", () => {
  it("allows Next.js inline hydration scripts and stays strict elsewhere", async () => {
    const rules = await config.headers!();
    expect(rules.length).toBeGreaterThan(0);
    const headers = rules[0].headers;
    const get = (key: string) => headers.find((h) => h.key === key)?.value ?? "";

    const csp = get("Content-Security-Policy");
    expect(csp).toContain("default-src 'self'");
    // Hydration requires inline scripts; no raw-HTML sinks exist in src,
    // so 'unsafe-inline' here does not open an injection path.
    expect(csp).toMatch(/script-src[^;]*'unsafe-inline'/);
    // Still no wildcard or third-party script hosts.
    const scriptSrc = (csp.match(/script-src[^;]*/) ?? [""])[0];
    expect(scriptSrc).not.toContain("*");
    expect(scriptSrc).not.toMatch(/https?:\/\//);

    expect(get("X-Content-Type-Options")).toBe("nosniff");
    expect(get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
