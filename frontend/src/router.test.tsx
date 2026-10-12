/**
 * Component tests (NOT backend proof): each route's page renders its
 * expected heading with the API stubbed. Real API behavior is verified
 * against a running backend, not here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import Overview from "./pages/Overview";
import Feedback from "./pages/Feedback";
import Insights from "./pages/Insights";
import Issues from "./pages/Issues";
import IssueDetail from "./pages/IssueDetail";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import NotFound from "./pages/NotFound";

const emptyMetrics = {
  totalRecords: 0,
  uniquePatterns: 0,
  duplicateRecords: 0,
  duplicationRate: 0,
  analyzed: 0,
  pending: 0,
  failed: 0,
  sentiment: { positive: 0, neutral: 0, negative: 0, unanalyzed: 0 },
  byCategory: [],
  topPatterns: [],
  byTopic: [],
  quality: { score: 0, grade: "F" },
  issues: { total: 0, high: 0, open: 0 },
  imports: 0,
  lastImportAt: null,
  hasTimestamps: false,
};

function stubFetch() {
  return vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () => {
          const u = String(url);
          if (u.includes("/api/metrics")) return Promise.resolve(emptyMetrics);
          if (u.includes("/api/issues/")) return Promise.resolve({
            issue: {
              id: 1,
              title: "Slow refunds",
              description: "Customers report slow refunds.",
              category: "Customer Service",
              primary_topic: "refunds",
              frequency_raw: 12,
              frequency_unique: 3,
              negative_count: 10,
              priority_score: 82,
              priority_band: "high",
              priority_explanation: "Frequent and negative.",
              recommendation: "Speed up the refund flow.",
              status: "open",
              updated_at: "2026-01-02 00:00:00",
              evidence_ids: "[]",
              created_at: "2026-01-01 00:00:00",
            },
            evidence: [],
          });
          if (u.includes("/api/issues")) return Promise.resolve({ issues: [] });
          if (u.includes("/api/feedback")) return Promise.resolve({ data: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
          if (u.includes("/api/adaption")) return Promise.resolve({ configured: false, quality: { score: 0, grade: "F", rawRows: 0, uniquePatterns: 0, duplicateRows: 0, checks: [] }, history: [] });
          if (u.includes("/api/analyze")) return Promise.resolve({ runs: [] });
          if (u.includes("/api/reports")) return Promise.resolve({ generatedAt: new Date().toISOString(), coverage: { totalRecords: 0, uniquePatterns: 0, duplicateRecords: 0, imports: 0 }, sentiment: { positive: 0, neutral: 0, negative: 0, unanalyzed: 0 }, byCategory: [], byTopic: [], quality: { score: 0, grade: "F" }, limitations: [] });
          if (u.includes("/api/health")) return Promise.resolve({ ok: true, database: "connected", feedbackRows: 0, openaiConfigured: false, adaptionConfigured: false, time: new Date().toISOString() });
          if (u.includes("/api/import")) return Promise.resolve({ imports: [] });
          if (u.includes("/api/auth/me")) return Promise.resolve({
            user: { id: "admin1", email: "admin@example.com", role: "admin", isDemo: false },
          });
          return Promise.resolve({});
        },
      })
    )
  );
}

function renderWithRouter(ui: React.ReactElement, initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>
  );
}

describe("routes render", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    stubFetch();
  });

  it("Overview renders", async () => {
    renderWithRouter(<Overview />);
    expect(await screen.findByRole("heading", { name: /start with real feedback|overview/i })).toBeDefined();
  });

  it("Feedback renders explorer", async () => {
    renderWithRouter(<Feedback />, "/feedback");
    expect(await screen.findByRole("heading", { name: /feedback explorer/i })).toBeDefined();
  });

  it("Insights renders", async () => {
    renderWithRouter(<Insights />);
    expect(await screen.findByRole("heading", { name: /ai insights/i })).toBeDefined();
  });

  it("Issues renders", async () => {
    renderWithRouter(<Issues />);
    expect(await screen.findByRole("heading", { name: /priority issues/i })).toBeDefined();
  });

  it("IssueDetail renders under /issues/:id", async () => {
    render(
      <MemoryRouter initialEntries={["/issues/1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/issues/:id" element={<IssueDetail />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByRole("heading", { name: "Slow refunds" })).toBeDefined();
  });

  it("Reports renders", async () => {
    renderWithRouter(<Reports />);
    expect(await screen.findByRole("heading", { name: /reports/i })).toBeDefined();
  });

  it("Settings renders", async () => {
    renderWithRouter(<Settings />);
    expect(await screen.findByRole("heading", { name: /settings and data/i })).toBeDefined();
  });

  it("Privacy renders", () => {
    renderWithRouter(<Privacy />);
    expect(screen.getByRole("heading", { name: /privacy policy/i })).toBeDefined();
  });

  it("Terms renders", () => {
    renderWithRouter(<Terms />);
    expect(screen.getByRole("heading", { name: /terms and conditions/i })).toBeDefined();
  });

  it("NotFound renders for unknown path", () => {
    renderWithRouter(<NotFound />, "/nope");
    expect(screen.getByRole("heading", { name: /does not exist/i })).toBeDefined();
  });
});
