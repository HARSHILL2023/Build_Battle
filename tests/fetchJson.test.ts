import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchError, fetchJson } from "@/lib/fetchJson";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchJson", () => {
  it("returns parsed JSON on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"a":1}', { status: 200 })));
    await expect(fetchJson<{ a: number }>("/x", 1000)).resolves.toEqual({ a: 1 });
  });

  it("rejects with status on non-2xx responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oops", { status: 500 })));
    const err = await fetchJson("/x", 1000).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).status).toBe(500);
  });

  it("rejects on malformed JSON bodies", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json{{", { status: 200 })));
    await expect(fetchJson("/x", 1000)).rejects.toThrow(/unreadable/);
  });

  it("aborts and reports a timeout instead of hanging forever", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError"))
            );
          })
      )
    );
    const pending = fetchJson("/x", 5000);
    const assertion = expect(pending).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });
});
