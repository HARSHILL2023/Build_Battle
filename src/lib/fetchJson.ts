/**
 * Client-safe JSON fetch with a hard timeout.
 *
 * Guarantees every data request settles: success returns parsed JSON,
 * while timeouts, network failures, non-2xx statuses, and malformed
 * bodies all reject with a readable message so pages can leave the
 * loading state for an error state with a retry action.
 */
export class FetchError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "FetchError";
    this.status = status;
  }
}

export async function fetchJson<T>(url: string, timeoutMs = 20000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new FetchError(`Request failed (status ${res.status}). Try again.`, res.status);
    }
    try {
      return (await res.json()) as T;
    } catch {
      throw new FetchError("The server returned an unreadable response. Try again.");
    }
  } catch (err) {
    if (err instanceof FetchError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new FetchError("The request timed out. Check that the server is running and try again.");
    }
    throw new FetchError("The network request failed. Check the connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}
