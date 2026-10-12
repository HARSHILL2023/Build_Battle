/**
 * MERN E2E suite (authenticated).
 *
 * Prerequisites (isolated test database only — never production):
 *   1. Start MongoDB and point the backend at an isolated database, e.g.
 *      MONGODB_URI=mongodb://localhost:27017/insightflow-e2e
 *   2. Seed one admin: `npm run create-admin` in insightflow/backend
 *      (or INSIGHTFLOW_SETUP_EMAIL / INSIGHTFLOW_SETUP_PASSWORD).
 *   3. Run the backend (`npm run dev`, port 5000) and the frontend
 *      (`npm run dev`, port 5173, which proxies /api to the backend).
 *   4. Set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD to that admin's credentials:
 *      $env:E2E_ADMIN_EMAIL="admin@example.com"; $env:E2E_ADMIN_PASSWORD="..."
 *      npx playwright test
 *
 * Authentication is real: every test logs in through the Login page, and API
 * setup/teardown uses `page.request` so the session cookie travels with the
 * calls. Nothing here mocks auth, and nothing points at real data.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API = "http://localhost:5173/api";
const stamp = Date.now();
const SENTINEL = `E2E probe ${stamp} isolated verification record`;
const IMPORT_TAG = `E2E import ${stamp}`;

const E2E_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const E2E_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

async function csrfHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  // Same browser context as the page, so this is the session's own token.
  const res = await request.get(`${API}/auth/csrf`);
  expect(res.ok(), `fetch csrf: ${await res.text()}`).toBe(true);
  const { csrfToken } = (await res.json()) as { csrfToken: string };
  return { "x-csrf-token": csrfToken };
}

async function apiCreateFeedback(request: APIRequestContext, review: string, category = "Other") {
  const res = await request.post(`${API}/feedback`, {
    data: { review, category },
    headers: await csrfHeaders(request),
  });
  expect(res.ok(), `create feedback: ${await res.text()}`).toBe(true);
  const body = (await res.json()) as { id: number };
  return body.id;
}

async function apiDeleteFeedback(request: APIRequestContext, id: number) {
  const res = await request.delete(`${API}/feedback/${id}`, { headers: await csrfHeaders(request) });
  expect(res.ok(), `delete feedback ${id}: ${await res.text()}`).toBe(true);
}

async function apiSearchIds(request: APIRequestContext, q: string): Promise<number[]> {
  const res = await request.get(`${API}/feedback`, { params: { q, pageSize: "100" } });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { data: { id: number }[] };
  return body.data.map((r) => r.id);
}

async function loginThroughUI(page: Page) {
  test.skip(
    !E2E_EMAIL || !E2E_PASSWORD,
    "Set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD for an admin in the isolated E2E database."
  );
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(E2E_EMAIL);
  await page.getByLabel(/password/i).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    // Chrome logs failed fetches as resource errors even when the app
    // handles them with an honest error state; only real app errors matter.
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) {
      errors.push(`console: ${m.text()}`);
    }
  });
  (page as unknown as { __e2eErrors: string[] }).__e2eErrors = errors;
});

test.afterEach(async ({ page }) => {
  const errors = (page as unknown as { __e2eErrors: string[] }).__e2eErrors ?? [];
  expect(errors, errors.join("\n")).toEqual([]);
});

test("unauthenticated visitors are sent to the login page", async ({ page }) => {
  await page.goto("/feedback");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
});

test("login and logout round-trip through the real endpoints", async ({ page }) => {
  await loginThroughUI(page);
  await expect(page.getByText(E2E_EMAIL, { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).first().click();
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  // The destroyed session no longer opens protected pages.
  await page.goto("/feedback");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
});

test("overview shows migrated metrics and all routes resolve", async ({ page }) => {
  await loginThroughUI(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("7,000", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/last import .* ago/)).toBeVisible();

  for (const [path, heading] of [
    ["/feedback", "Feedback Explorer"],
    ["/insights", "AI Insights"],
    ["/issues", "Priority Issues"],
    ["/reports", "Reports"],
    ["/settings", "Settings and Data"],
    ["/privacy", "Privacy Policy"],
    ["/terms", "Terms and Conditions"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  }

  await page.goto("/definitely-not-a-route");
  await expect(page.getByText("Back to overview")).toBeVisible();
});

test("feedback search, filter, detail modal, and direct URL navigation", async ({ page }) => {
  await loginThroughUI(page);
  const request = page.request;
  const id = await apiCreateFeedback(request, SENTINEL);
  try {
    await page.goto("/feedback");
    await page.getByPlaceholder("Search feedback text…").fill(SENTINEL);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("1 record", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: SENTINEL }).first()).toBeVisible();

    await page.goto("/feedback?sentiment=negative");
    await expect(page.getByRole("heading", { name: "Feedback Explorer" })).toBeVisible();
    await expect(page.locator("table.data-table tbody tr").first()).toBeVisible();

    await page.goto("/feedback");
    await page.getByPlaceholder("Search feedback text…").fill(SENTINEL);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: SENTINEL }).first().click();
    await expect(page.getByRole("dialog", { name: "Feedback detail" })).toBeVisible();
    await expect(page.getByText("Identical copies")).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Feedback detail" })).toHaveCount(0);
  } finally {
    await apiDeleteFeedback(request, id);
  }
});

test("feedback submit and delete through the UI", async ({ page }) => {
  await loginThroughUI(page);
  const request = page.request;
  const text = `E2E submission ${stamp} submitted through the browser form`;
  await page.goto("/feedback");
  await page.locator("#new-review").fill(text);
  await page.getByRole("button", { name: "Submit feedback" }).click();
  await expect(page.getByText("Feedback saved and queued for analysis.")).toBeVisible();

  await page.getByPlaceholder("Search feedback text…").fill(text);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("button", { name: text }).first()).toBeVisible();

  const ids = await apiSearchIds(request, text);
  expect(ids).toHaveLength(1);
  await page.getByRole("button", { name: `Delete feedback ${ids[0]}` }).click();
  await page.getByRole("button", { name: "Delete record" }).click();
  await expect(page.getByText("No feedback matches")).toBeVisible();
  expect(await apiSearchIds(request, text)).toHaveLength(0);
});

test("CSV import through the UI with API cleanup", async ({ page }) => {
  await loginThroughUI(page);
  const request = page.request;
  const csv = `review,category\n"${IMPORT_TAG} first row for browser import verification",Other\n"${IMPORT_TAG} second row for browser import verification",Product Feedback\n`;
  await page.goto("/feedback");
  await page.locator("#csv-upload").setInputFiles({
    name: "e2e-import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByText("Imported 2 of 2 rows from e2e-import.csv.")).toBeVisible();

  const ids = await apiSearchIds(request, IMPORT_TAG);
  expect(ids).toHaveLength(2);
  for (const id of ids) await apiDeleteFeedback(request, id);
  expect(await apiSearchIds(request, IMPORT_TAG)).toHaveLength(0);
});

test("CSV exports download with guarded headers", async ({ page }) => {
  await loginThroughUI(page);
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();

  const feedbackDl = page.waitForEvent("download");
  await page.getByRole("link", { name: "Feedback CSV" }).click();
  const feedbackFile = await feedbackDl;
  expect(feedbackFile.suggestedFilename()).toMatch(/insightflow-feedback\.csv/);
  const feedbackPath = await feedbackFile.path();
  const { readFile } = await import("node:fs/promises");
  const head = (await readFile(feedbackPath!, "utf8")).slice(0, 120);
  expect(head).toContain("id,review,source_category");

  const issuesDl = page.waitForEvent("download");
  await page.getByRole("link", { name: "Issues CSV" }).click();
  const issuesFile = await issuesDl;
  expect(issuesFile.suggestedFilename()).toMatch(/insightflow-issues\.csv/);
});

test("issue status update persists across reload, then restored", async ({ page }) => {
  await loginThroughUI(page);
  const request = page.request;
  const list = await request.get(`${API}/issues`);
  expect(list.ok()).toBe(true);
  const { issues } = (await list.json()) as { issues: { id: number; status: string }[] };
  expect(issues.length).toBeGreaterThan(0);
  const target = issues[0];
  const original = target.status;
  const flipped = original === "open" ? "in_progress" : "open";

  await page.goto(`/issues/${target.id}`);
  await expect(page.getByText(`Score`, { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: flipped.replace("_", " "), exact: true }).click();
  await expect(page.getByText(`Score`, { exact: false }).first()).toBeVisible();
  await page.reload();
  await expect(page.locator("main")).toContainText(flipped.replace("_", " "));

  const back = await request.patch(`${API}/issues/${target.id}`, {
    data: { status: original },
    headers: await csrfHeaders(request),
  });
  expect(back.ok(), `restore status: ${await back.text()}`).toBe(true);
  await page.reload();
  await expect(page.locator("main")).toContainText(original.replace("_", " "));
});

test("insights and settings render without running analysis", async ({ page }) => {
  await loginThroughUI(page);
  await page.goto("/insights");
  await expect(page.getByRole("heading", { name: "AI Insights" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Run analysis/ })).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings and Data" })).toBeVisible();
  const clearButton = page.getByRole("button", { name: "Delete all data" });
  await expect(clearButton).toBeDisabled();
  await page.getByPlaceholder("Type DELETE ALL DATA").fill("DELETE");
  await expect(clearButton).toBeDisabled();
});

test("missing issue shows the error state with retry", async ({ page }) => {
  await loginThroughUI(page);
  await page.goto("/issues/999999999");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: /try again/i })).toBeVisible();
});

test("responsive layouts do not overflow", async ({ page }) => {
  await loginThroughUI(page);
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/feedback");
    await expect(page.getByRole("heading", { name: "Feedback Explorer" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});
