/**
 * Central API client for the InsightFlow frontend.
 *
 * Cookie-based sessions: every request sends `credentials: "include"` so the
 * HttpOnly session cookie reaches the Express backend. No server secrets or
 * bearer tokens live here or in any `VITE_*` variable.
 *
 * State-changing requests (POST/PATCH/PUT/DELETE) also attach the session's
 * synchronizer CSRF token in the backend's expected `x-csrf-token` header.
 * The token is fetched from `GET /api/auth/csrf` and refreshed after login
 * and whenever the server reports a CSRF mismatch.
 *
 * Base URL comes from `VITE_API_URL` (see .env.example); in dev it falls
 * back to http://localhost:5000, which the Vite dev server also proxies
 * via `/api`. Paths starting with `/api` are resolved against the base.
 */

export const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:5000";

export const CSRF_HEADER = "x-csrf-token";

export class FetchError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "FetchError";
    this.status = status;
  }
}

export function isAuthError(err: unknown): boolean {
  return err instanceof FetchError && err.status === 401;
}

export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/api")) return `${API_BASE_URL}${path}`;
  return path;
}

let csrfToken: string | null = null;

function readError(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return fallback;
}

/** Fetch (or reuse) the synchronizer CSRF token for this session. */
export async function getCsrfToken(forceRefresh = false): Promise<string> {
  if (csrfToken && !forceRefresh) return csrfToken;
  const res = await sendRequest(resolveApiUrl("/api/auth/csrf"), { credentials: "include" });
  if (!res.ok) {
    throw new FetchError("Could not start a session. Check that the server is running.", res.status);
  }
  const body = (await res.json().catch(() => null)) as { csrfToken?: unknown } | null;
  if (!body || typeof body.csrfToken !== "string" || body.csrfToken.length === 0) {
    throw new FetchError("The server returned an unreadable response. Try again.");
  }
  csrfToken = body.csrfToken;
  return csrfToken;
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

function networkError(err: unknown): never {
  if (err instanceof FetchError) throw err;
  if (err instanceof DOMException && err.name === "AbortError") {
    throw new FetchError("The request timed out. Check that the server is running and try again.");
  }
  throw new FetchError("The network request failed. Check the connection and try again.");
}

/**
 * Raw fetch rejections (CORS block, DNS failure, backend down) surface as
 * TypeError("Failed to fetch"). Normalize them to FetchError so callers that
 * use fetch directly (login, demo, logout, CSRF mint) report the same
 * actionable message as fetchJson/mutateJson instead of the raw browser text.
 */
async function sendRequest(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    networkError(err);
  }
}

async function parseBody<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchJson<T>(url: string, timeoutMs = 20000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(resolveApiUrl(url), {
      signal: controller.signal,
      credentials: "include",
    });
    if (!res.ok) {
      if (res.status === 401) {
        throw new FetchError("Your session has expired. Please log in again.", 401);
      }
      const body = await parseBody<T & { error?: string }>(res);
      throw new FetchError(
        readError(body, `Request failed (status ${res.status}). Try again.`),
        res.status
      );
    }
    const body = await parseBody<T>(res);
    if (body === null) {
      throw new FetchError("The server returned an unreadable response. Try again.");
    }
    return body;
  } catch (err) {
    networkError(err);
  } finally {
    clearTimeout(timer);
  }
}

interface MutateOptions {
  timeoutMs?: number;
  retryOnCsrfMismatch?: boolean;
}

async function mutateJson<T>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  url: string,
  body: unknown,
  { timeoutMs = 20000, retryOnCsrfMismatch = true }: MutateOptions = {}
): Promise<T> {
  const token = await getCsrfToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(resolveApiUrl(url), {
      method,
      headers: { "Content-Type": "application/json", [CSRF_HEADER]: token },
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const parsed = await parseBody<T & { error?: string }>(res);
    if (!res.ok) {
      if (res.status === 401) {
        setCsrfToken(null);
        throw new FetchError("Your session has expired. Please log in again.", 401);
      }
      // A rotated or missing synchronizer token is recoverable: refresh once
      // and retry rather than failing the user's action.
      if (res.status === 403 && retryOnCsrfMismatch && readError(parsed, "").includes("CSRF")) {
        await getCsrfToken(true);
        return mutateJson<T>(method, url, body, { timeoutMs, retryOnCsrfMismatch: false });
      }
      throw new FetchError(readError(parsed, `Request failed (status ${res.status}). Try again.`), res.status);
    }
    return (parsed ?? ({} as T)) as T;
  } catch (err) {
    networkError(err);
  } finally {
    clearTimeout(timer);
  }
}

export async function apiPostJson<T>(url: string, body: unknown, timeoutMs = 20000): Promise<T> {
  return mutateJson<T>("POST", url, body, { timeoutMs });
}

export async function apiPatchJson<T>(url: string, body: unknown, timeoutMs = 20000): Promise<T> {
  return mutateJson<T>("PATCH", url, body, { timeoutMs });
}

export async function apiDeleteJson<T>(url: string, body?: unknown, timeoutMs = 20000): Promise<T> {
  return mutateJson<T>("DELETE", url, body, { timeoutMs });
}

/** Multipart upload (CSV import). No explicit Content-Type: the browser sets it. */
export async function apiUploadForm<T>(url: string, form: FormData, timeoutMs = 60000): Promise<T> {
  const token = await getCsrfToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(resolveApiUrl(url), {
      method: "POST",
      headers: { [CSRF_HEADER]: token },
      credentials: "include",
      body: form,
      signal: controller.signal,
    });
    const parsed = await parseBody<T & { error?: string }>(res);
    if (!res.ok) {
      if (res.status === 401) {
        setCsrfToken(null);
        throw new FetchError("Your session has expired. Please log in again.", 401);
      }
      throw new FetchError(readError(parsed, `Request failed (status ${res.status}). Try again.`), res.status);
    }
    return (parsed ?? ({} as T)) as T;
  } catch (err) {
    networkError(err);
  } finally {
    clearTimeout(timer);
  }
}

export interface SessionUser {
  id: string;
  email: string;
  role: "user" | "admin";
  isDemo: boolean;
}

/** Session status probe. Returns null when there is no valid session. */
export async function getSession(): Promise<SessionUser | null> {
  try {
    const body = await fetchJson<{ user: SessionUser }>("/api/auth/me");
    return body.user ?? null;
  } catch (err) {
    if (isAuthError(err)) return null;
    throw err;
  }
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const token = await getCsrfToken();
  const res = await sendRequest(resolveApiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json", [CSRF_HEADER]: token },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  const parsed = (await res.json().catch(() => null)) as {
    user?: SessionUser;
    csrfToken?: string;
    error?: string;
  } | null;
  if (!res.ok || !parsed?.user) {
    throw new FetchError(readError(parsed, "Login failed. Try again."), res.status);
  }
  // Login rotates the session server-side; adopt the fresh CSRF token.
  setCsrfToken(parsed.csrfToken ?? null);
  return parsed.user;
}

export async function logout(): Promise<void> {
  const token = await getCsrfToken();
  try {
    await sendRequest(resolveApiUrl("/api/auth/logout"), {
      method: "POST",
      headers: { [CSRF_HEADER]: token },
      credentials: "include",
    });
  } finally {
    setCsrfToken(null);
  }
}

/** Passwordless demo entry ("Try Live Demo"). Same session + CSRF rotation as login. */
export async function demoLogin(): Promise<SessionUser> {
  const token = await getCsrfToken();
  const res = await sendRequest(resolveApiUrl("/api/auth/demo"), {
    method: "POST",
    headers: { "Content-Type": "application/json", [CSRF_HEADER]: token },
    credentials: "include",
    body: JSON.stringify({}),
  });
  const parsed = (await res.json().catch(() => null)) as {
    user?: SessionUser;
    csrfToken?: string;
    error?: string;
  } | null;
  if (!res.ok || !parsed?.user) {
    throw new FetchError(readError(parsed, "Demo access failed. Try again."), res.status);
  }
  setCsrfToken(parsed.csrfToken ?? null);
  return parsed.user;
}

/** Absolute URL for CSV download anchors (type=feedback|issues). */
export function csvUrl(type: "feedback" | "issues"): string {
  return resolveApiUrl(`/api/reports?format=csv&type=${type}`);
}

export interface DashboardMetrics {
  totalRecords: number;
  uniquePatterns: number;
  duplicateRecords: number;
  duplicationRate: number;
  analyzed: number;
  pending: number;
  failed: number;
  sentiment: { positive: number; neutral: number; negative: number; unanalyzed: number };
  byCategory: { category: string; total: number; negative: number; positive: number; neutral: number }[];
  topPatterns: { hash: string; review: string; category: string; count: number; sentiment: string | null }[];
  byTopic: { topic: string; label: string; raw: number; unique: number; negative: number }[];
  quality: { score: number; grade: string };
  issues: { total: number; high: number; open: number };
  imports: number;
  lastImportAt: string | null;
  hasTimestamps: false;
}
