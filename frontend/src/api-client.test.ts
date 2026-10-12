/** Unit tests for the central API client. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  FetchError,
  demoLogin,
  fetchJson,
  login,
  resolveApiUrl,
  csvUrl,
  setCsrfToken,
  API_BASE_URL,
} from "./api/client";

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

describe("auth requests", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    setCsrfToken(null);
  });

  function stubCsrfThen(followUp: (url: string, init?: RequestInit) => Promise<unknown>) {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (calls.length === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ csrfToken: "csrf-0" }),
          });
        }
        return followUp(url, init);
      })
    );
    return calls;
  }

  it("maps a failed CSRF mint to FetchError, not raw Failed to fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    );
    const err = await login("a@example.com", "password").catch((e) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as Error).message).toMatch(/network/i);
  });

  it("maps a failed login POST to FetchError and sends cookies plus CSRF", async () => {
    const calls = stubCsrfThen(() => Promise.reject(new TypeError("Failed to fetch")));
    const err = await login("a@example.com", "password").catch((e) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as Error).message).toMatch(/network/i);
    expect(calls.length).toBe(2);
    expect(calls[1].url).toBe(`${API_BASE_URL}/api/auth/login`);
    expect(calls[1].init?.credentials).toBe("include");
    expect((calls[1].init?.headers as Record<string, string>)["x-csrf-token"]).toBe("csrf-0");
  });

  it("maps a failed demo POST to FetchError against the demo endpoint", async () => {
    const calls = stubCsrfThen(() => Promise.reject(new TypeError("Failed to fetch")));
    const err = await demoLogin().catch((e) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as Error).message).toMatch(/network/i);
    expect(calls.length).toBe(2);
    expect(calls[1].url).toBe(`${API_BASE_URL}/api/auth/demo`);
    expect(calls[1].init?.credentials).toBe("include");
  });
});
