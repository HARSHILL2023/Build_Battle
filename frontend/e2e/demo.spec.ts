/**
 * Demo-mode E2E suite ("Try Live Demo").
 *
 * Same prerequisites as mern.spec.ts (isolated test database only — never
 * production): backend on :5000 with DEMO_ENABLED=true (the default),
 * frontend on :5173. No credentials needed for demo tests; the admin test
 * additionally requires E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.
 *
 * Proves: passwordless demo entry works, demo visitors can read every
 * intended page, every write/admin API call is rejected server-side (403)
 * even with a valid demo session + CSRF token, real data is unchanged,
 * and normal admin login still writes.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API = "http://localhost:5173/api";
const E2E_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const E2E_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

async function csrfHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.get(`${API}/auth/csrf`);
  expect(res.ok(), `fetch csrf: ${await res.text()}`).toBe(true);
  const { csrfToken } = (await res.json()) as { csrfToken: string };
  return { "x-csrf-token": csrfToken };
}

async function enterDemo(page: Page) {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /try live demo/i })).toBeVisible();
  await page.getByRole("button", { name: /try live demo/i }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Demo · read-only", { exact: false }).first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
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

test("demo entry signs in without credentials and marks the session", async ({ page }) => {
  await enterDemo(page);
  const me = await page.request.get(`${API}/auth/me`);
  expect(me.ok()).toBe(true);
  expect(await me.json()).toMatchObject({
    user: { email: "demo@insightflow.local", role: "user", isDemo: true },
  });
});

test("demo visitors can read dashboard, feedback, insights, issues, reports, settings", async ({
  page,
}) => {
  await enterDemo(page);
  for (const [path, heading] of [
    ["/", "Overview"],
    ["/feedback", "Feedback Explorer"],
    ["/insights", "AI Insights"],
    ["/issues", "Priority Issues"],
    ["/reports", "Reports"],
    ["/settings", "Settings and Data"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  }
  for (const path of ["/api/metrics", "/api/feedback", "/api/issues", "/api/reports", "/api/import"]) {
    const res = await page.request.get(`${API}${path.slice(4)}`);
    expect(res.ok(), `GET ${path}`).toBe(true);
  }
});

test("demo write UI is hidden or disabled", async ({ page }) => {
  await enterDemo(page);

  await page.goto("/feedback");
  await expect(page.getByRole("heading", { name: "Feedback Explorer" })).toBeVisible();
  await expect(page.getByText("Demo mode is read-only", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /submit feedback/i })).toHaveCount(0);
  await expect(page.locator("#new-review")).toHaveCount(0);
  await expect(page.locator("#csv-upload")).toHaveCount(0);

  await page.goto("/insights");
  await expect(page.getByRole("button", { name: /run analysis/i })).toBeDisabled();

  await page.goto("/settings");
  await expect(page.getByRole("button", { name: /test live connection/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /delete all data/i })).toBeDisabled();

  const issues = await page.request.get(`${API}/issues`);
  expect(issues.ok()).toBe(true);
  const list = (await issues.json()) as { issues: { id: number; status: string }[] };
  test.skip(!list.issues.length, "No issues in the isolated E2E database; nothing to check.");
  await page.goto(`/issues/${list.issues[0].id}`);
  for (const name of ["open", "in progress", "resolved"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
  }
});

test("demo API writes are rejected server-side and data is unchanged", async ({ page }) => {
  await enterDemo(page);
  const request = page.request;
  const headers = await csrfHeaders(request);

  const before = (await (await request.get(`${API}/metrics`)).json()) as { totalRecords: number };

  const blocked: [string, string, unknown][] = [
    ["POST", "/feedback", { review: "demo write attempt must fail", category: "Other" }],
    ["POST", "/import", { sample: "official-500" }],
    ["POST", "/analyze", { method: "auto", onlyPending: false }],
    ["POST", "/adaption", { action: "test" }],
    ["DELETE", "/data", { confirm: "DELETE ALL DATA" }],
    ["POST", "/auth/users", { email: "evil@example.com", password: "a long password 123" }],
    ["GET", "/auth/users", undefined],
  ];
  for (const [method, path, body] of blocked) {
    const res =
      method === "POST"
        ? await request.post(`${API}${path}`, { data: body, headers })
        : method === "DELETE"
          ? await request.delete(`${API}${path}`, { data: body, headers })
          : await request.get(`${API}${path}`);
    expect(res.status(), `${method} ${path}`).toBe(403);
  }

  const issues = (await (await request.get(`${API}/issues`)).json()) as {
    issues: { id: number }[];
  };
  if (issues.issues.length > 0) {
    const patch = await request.patch(`${API}/issues/${issues.issues[0].id}`, {
      data: { status: "resolved" },
      headers,
    });
    expect(patch.status(), "PATCH /issues/:id").toBe(403);
  }
  const sessions = (await request.get(`${API}/auth/sessions`)).json() as Promise<{
    sessions: { id: string }[];
  }>;
  const ownId = (await sessions).sessions[0]?.id;
  if (ownId) {
    const revoke = await request.delete(`${API}/auth/sessions/${ownId}`, { headers });
    expect(revoke.status(), "DELETE /auth/sessions/:id").toBe(403);
  }

  // No probe record leaked in, and the dataset is untouched.
  const search = await request.get(`${API}/feedback`, { params: { q: "demo write attempt must fail" } });
  expect(search.ok()).toBe(true);
  expect(((await search.json()) as { total: number }).total).toBe(0);
  const after = (await (await request.get(`${API}/metrics`)).json()) as { totalRecords: number };
  expect(after.totalRecords).toBe(before.totalRecords);
});

test("demo visitors can log out", async ({ page }) => {
  await enterDemo(page);
  await page.getByRole("button", { name: "Log out" }).first().click();
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await page.goto("/feedback");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
});

test("normal admin login still works and still writes", async ({ page }) => {
  test.skip(
    !E2E_EMAIL || !E2E_PASSWORD,
    "Set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD for an admin in the isolated E2E database."
  );
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(E2E_EMAIL);
  await page.getByLabel(/password/i).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Demo · read-only", { exact: false })).toHaveCount(0);

  const request = page.request;
  const headers = await csrfHeaders(request);
  const text = `Admin E2E write probe ${Date.now()}`;
  const created = await request.post(`${API}/feedback`, {
    data: { review: text, category: "Other" },
    headers,
  });
  expect(created.ok(), `admin create: ${await created.text()}`).toBe(true);
  const id = ((await created.json()) as { id: number }).id;
  try {
    const found = await request.get(`${API}/feedback`, { params: { q: text } });
    expect(((await found.json()) as { total: number }).total).toBe(1);
  } finally {
    const deleted = await request.delete(`${API}/feedback/${id}`, { headers });
    expect(deleted.ok(), `admin cleanup: ${await deleted.text()}`).toBe(true);
  }
});
