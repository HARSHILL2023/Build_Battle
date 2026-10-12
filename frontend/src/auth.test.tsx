/** Auth client + login flow tests (stubbed fetch, no backend). */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  apiPostJson,
  demoLogin,
  getSession,
  login,
  setCsrfToken,
  FetchError,
} from "./api/client";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import Login from "./pages/Login";

const user = { id: "u1", email: "admin@example.com", role: "admin" as const };

function stubAuthFetch(opts: { meStatus?: number } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const u = String(url);
      if (u.endsWith("/api/auth/csrf")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ csrfToken: "csrf-123" }) });
      }
      if (u.endsWith("/api/auth/login")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ user, csrfToken: "csrf-456" }),
        });
      }
      if (u.endsWith("/api/auth/me")) {
        if (opts.meStatus === 401) {
          return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: "x" }) });
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ user }) });
      }
      if (u.endsWith("/api/feedback")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "no" }) });
    })
  );
  return calls;
}

describe("auth client", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    setCsrfToken(null);
  });

  it("attaches credentials and the CSRF token to POSTs", async () => {
    const calls = stubAuthFetch();
    await apiPostJson("/api/feedback", { review: "hi", category: "Other" });
    const post = calls.find((c) => String(c.url).endsWith("/api/feedback"))!;
    expect(post.init?.credentials).toBe("include");
    expect((post.init?.headers as Record<string, string>)["x-csrf-token"]).toBe("csrf-123");
  });

  it("logs in and adopts the rotated CSRF token", async () => {
    const calls = stubAuthFetch();
    const u = await login("admin@example.com", "correct horse battery staple");
    expect(u).toEqual(user);
    const second = await apiPostJson("/api/feedback", {});
    void second;
    const post = calls.find((c) => String(c.url).endsWith("/api/feedback"))!;
    expect((post.init?.headers as Record<string, string>)["x-csrf-token"]).toBe("csrf-456");
  });

  it("reports a failed login with the server message", async () => {
    stubAuthFetch();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const u = String(url);
        if (u.endsWith("/api/auth/csrf")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ csrfToken: "c" }) });
        }
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: "Invalid email or password." }),
        });
      })
    );
    const err = await login("a@b.c", "wrong password here").catch((e) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as Error).message).toBe("Invalid email or password.");
  });

  it("returns null session on 401 without throwing", async () => {
    stubAuthFetch({ meStatus: 401 });
    await expect(getSession()).resolves.toBeNull();
  });
});

function Probe() {
  const { user: u, loading } = useAuth();
  return <p>{loading ? "loading" : (u?.email ?? "anonymous")}</p>;
}

describe("demo mode", () => {
  const demoUser = { id: "demo1", email: "demo@insightflow.local", role: "user" as const, isDemo: true };

  function stubDemo() {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        calls.push({ url, init });
        const u = String(url);
        if (u.endsWith("/api/auth/csrf")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ csrfToken: "csrf-d" }) });
        }
        if (u.endsWith("/api/auth/demo")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ user: demoUser, csrfToken: "csrf-d2" }),
          });
        }
        if (u.endsWith("/api/auth/me")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ user: demoUser }) });
        }
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "no" }) });
      })
    );
    return calls;
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
    setCsrfToken(null);
  });

  it("signs in without credentials and adopts the rotated token", async () => {
    const calls = stubDemo();
    const u = await demoLogin();
    expect(u).toEqual(demoUser);
    const demoCall = calls.find((c) => String(c.url).endsWith("/api/auth/demo"))!;
    expect(demoCall.init?.credentials).toBe("include");
    expect((demoCall.init?.headers as Record<string, string>)["x-csrf-token"]).toBe("csrf-d");
    expect(JSON.parse(String(demoCall.init?.body ?? "{}"))).toEqual({});
  });

  it("login page offers Try Live Demo and signs in on click", async () => {
    // Anonymous session: /me answers 401 until the demo button is clicked.
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith("/api/auth/me")) {
          return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: "x" }) });
        }
        if (u.endsWith("/api/auth/csrf")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ csrfToken: "csrf-d" }) });
        }
        if (u.endsWith("/api/auth/demo")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ user: demoUser, csrfToken: "csrf-d2" }),
          });
        }
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "no" }) });
      })
    );
    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
          <Probe />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText("anonymous")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /try live demo/i }));
    await waitFor(() => expect(screen.getByText("demo@insightflow.local")).toBeDefined());
  });
});

describe("AuthProvider and Login page", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    setCsrfToken(null);
  });

  it("loads the session on mount", async () => {
    stubAuthFetch();
    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText("admin@example.com")).toBeDefined();
  });

  it("stays anonymous when there is no session", async () => {
    stubAuthFetch({ meStatus: 401 });
    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText("anonymous")).toBeDefined();
  });

  it("login form submits credentials and shows the user", async () => {
    stubAuthFetch({ meStatus: 401 });
    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
          <Probe />
        </AuthProvider>
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "admin@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "correct horse battery staple" } });
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));
    await waitFor(() => expect(screen.getByText("admin@example.com")).toBeDefined());
  });
});
