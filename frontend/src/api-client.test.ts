/** Unit tests for the central API client. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FetchError, fetchJson, resolveApiUrl, csvUrl, API_BASE_URL } from "./api/client";

describe("api client", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("has a base URL (env or localhost fallback)", () => {
    expect(typeof API_BASE_URL).toBe("string");
    expect(API_BASE_URL.length).toBeGreaterThan(0);
  });

  it("resolves /api paths against the base URL", () => {
    expect(resolveApiUrl("/api/metrics")).toBe(`${API_BASE_URL}/api/metrics`);
  });

  it("leaves absolute URLs untouched", () => {
    expect(resolveApiUrl("https://example.com/x")).toBe("https://example.com/x");
  });

  it("builds CSV download URLs", () => {
    expect(csvUrl("feedback")).toBe(`${API_BASE_URL}/api/reports?format=csv&type=feedback`);
    expect(csvUrl("issues")).toBe(`${API_BASE_URL}/api/reports?format=csv&type=issues`);
  });

  it("returns parsed JSON on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ a: 1 }) }))
    );
    await expect(fetchJson<{ a: number }>("/api/metrics")).resolves.toEqual({ a: 1 });
  });

  it("throws FetchError with status on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }))
    );
    const err = await fetchJson("/api/metrics").catch((e) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).status).toBe(500);
  });

  it("throws FetchError on unreadable body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error("bad json")) })
      )
    );
    await expect(fetchJson("/api/metrics")).rejects.toBeInstanceOf(FetchError);
  });

  it("throws FetchError on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    );
    const err = await fetchJson("/api/metrics").catch((e) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as Error).message).toMatch(/network/i);
  });

  it("throws timeout FetchError on abort", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, opts?: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        });
      })
    );
    const err = await fetchJson("/api/metrics", 20).catch((e) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as Error).message).toMatch(/timed out/i);
  }, 10000);
});
