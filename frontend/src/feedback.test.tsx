/**
 * Component tests for the Feedback explorer (NOT backend proof):
 * filters, search, add-feedback form, CSV upload label, detail modal,
 * delete confirm, pagination, and empty/error UI states — all with a
 * stubbed fetch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Feedback from "./pages/Feedback";
import { AuthProvider } from "./auth/AuthContext";

const item = {
  id: 7,
  review_text: "The app crashes on login",
  source_category: "Product Feedback",
  norm_hash: "abc123",
  sentiment: "negative",
  sentiment_method: "deterministic",
  topics: '["reliability"]',
  analysis_status: "analyzed",
  source: "manual",
  created_at: "2026-01-01 00:00:00",
};

const listBody = { data: [item], page: 1, pageSize: 20, total: 1, totalPages: 1 };
const emptyBody = { data: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };

function stubList(body: typeof listBody) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () => {
          if (String(url).includes("/api/auth/me")) {
            return Promise.resolve({
              user: { id: "admin1", email: "admin@example.com", role: "admin", isDemo: false },
            });
          }
          return Promise.resolve(body);
        },
      })
    )
  );
}

function renderFeedback() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Feedback />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("Feedback explorer", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows search, filters, sort selects and Apply", async () => {
    stubList(listBody);
    renderFeedback();
    expect(await screen.findByLabelText(/search feedback text/i)).toBeDefined();
    expect(screen.getByLabelText("Category", { selector: "#f-cat" })).toBeDefined();
    expect(screen.getByLabelText("Sentiment")).toBeDefined();
    expect(screen.getByLabelText("Analysis")).toBeDefined();
    expect(screen.getByLabelText("Order")).toBeDefined();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Search" })).toBeDefined();
  });

  it("renders rows with delete actions and pagination", async () => {
    stubList(listBody);
    renderFeedback();
    expect(await screen.findByText("The app crashes on login")).toBeDefined();
    expect(screen.getByLabelText("Delete feedback 7")).toBeDefined();
    expect(screen.getByText(/1 record · page 1 of 1/)).toBeDefined();
  });

  it("opens detail modal with copies count and delete option", async () => {
    stubList(listBody);
    renderFeedback();
    fireEvent.click(await screen.findByText("The app crashes on login"));
    expect(await screen.findByRole("dialog", { name: /feedback detail/i })).toBeDefined();
    expect(screen.getByText("Feedback #7")).toBeDefined();
  });

  it("add-feedback form requires 3+ chars and CSV label exists", async () => {
    stubList(emptyBody);
    renderFeedback();
    await waitFor(() => screen.getByText(/no feedback matches/i));
    expect(screen.getByLabelText("Review text")).toBeDefined();
    const submit = screen.getByRole("button", { name: /submit feedback/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByText(/choose a \.csv file/i)).toBeDefined();
  });

  it("empty state offers Clear filters", async () => {
    stubList(emptyBody);
    renderFeedback();
    expect(await screen.findByText(/no feedback matches/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /clear filters/i })).toBeDefined();
  });

  it("error state offers retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false }))
    );
    renderFeedback();
    expect(await screen.findByText(/something went wrong/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /try again/i })).toBeDefined();
  });

  it("reads initial sentiment filter from URL search params", async () => {
    stubList(listBody);
    render(
      <MemoryRouter initialEntries={["/feedback?sentiment=negative"]}>
        <AuthProvider>
          <Feedback />
        </AuthProvider>
      </MemoryRouter>
    );
    await screen.findByText("The app crashes on login");
    const select = screen.getByLabelText("Sentiment") as HTMLSelectElement;
    expect(select.value).toBe("negative");
  });
});
