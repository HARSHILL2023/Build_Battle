/**
 * Navbar layout regression test (demo vs admin).
 *
 * Root cause: the desktop header was `flex justify-between` with no
 * shrink/truncation strategy. The demo-only "Demo · read-only" badge plus
 * the longer demo email enlarged the right cluster, the middle nav shrank,
 * and two-word labels ("AI Insights", "Priority Issues") wrapped to two
 * lines because links allowed `white-space: normal`.
 *
 * This test locks the flex contract: nav labels stay on one line
 * (`whitespace-nowrap` + `shrink-0`), the email is the flexible element
 * (`min-w-0` + `truncate` ellipsis), and the badge/logout are protected
 * (`shrink-0` + `whitespace-nowrap`). jsdom has no layout engine, so we
 * assert the classes that guarantee single-line behavior in a real browser
 * (verified manually with Playwright at 1280px: all links h-38, no overflow).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";
import { SiteNav } from "./SiteNav";

const adminUser = { id: "admin1", email: "admin@example.com", role: "admin", isDemo: false };
const demoUser = { id: "demo1", email: "demo@insightflow.local", role: "user", isDemo: true };

function stubSession(user: typeof adminUser) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => {
          if (String(url).includes("/api/auth/me")) return Promise.resolve({ user });
          return Promise.resolve({});
        },
      })
    )
  );
}

function renderNav() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AuthProvider>
        <SiteNav />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("SiteNav layout (demo vs admin)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("admin navbar keeps labels on one line and truncates identity", async () => {
    stubSession(adminUser);
    const { container } = renderNav();
    await screen.findByText("admin@example.com");

    const primary = container.querySelector('nav[aria-label="Primary"]');
    expect(primary).toBeTruthy();
    // Deliberate responsive menu: desktop nav only at xl+, hamburger below.
    expect(primary?.className).toMatch(/hidden/);
    expect(primary?.className).toMatch(/xl:flex/);

    const links = Array.from(primary?.querySelectorAll("a") ?? []);
    expect(links).toHaveLength(6);
    for (const a of links) {
      expect(a.className).toMatch(/whitespace-nowrap/);
      expect(a.className).toMatch(/shrink-0/);
    }

    const email = await screen.findByTitle("admin@example.com");
    expect(email.className).toMatch(/truncate/);
    expect(email.className).toMatch(/min-w-0/);

    expect(screen.queryByText(/demo · read-only/i)).toBeNull();
  });

  it("demo navbar keeps badge visible while email truncates and labels stay single-line", async () => {
    stubSession(demoUser);
    const { container } = renderNav();
    await screen.findByText("demo@insightflow.local");

    const primary = container.querySelector('nav[aria-label="Primary"]');
    const links = Array.from(primary?.querySelectorAll("a") ?? []);
    expect(links).toHaveLength(6);
    for (const a of links) {
      expect(a.className).toMatch(/whitespace-nowrap/);
      expect(a.className).toMatch(/shrink-0/);
    }

    // Email is the flexible element: min-w-0 lets flex shrink it, truncate renders ellipsis.
    const email = await screen.findByTitle("demo@insightflow.local");
    expect(email.className).toMatch(/truncate/);
    expect(email.className).toMatch(/min-w-0/);
    expect(email.className).toMatch(/max-w-/);

    // Read-only badge stays visible and never wraps or shrinks away.
    const badge = await screen.findByText(/demo · read-only/i);
    expect(badge.className).toMatch(/whitespace-nowrap/);
    expect(badge.className).toMatch(/shrink-0/);

    // Logout stays on one line and is protected from shrinking.
    const logout = screen.getByRole("button", { name: /^log out$/i });
    expect(logout.className).toMatch(/whitespace-nowrap/);
    expect(logout.className).toMatch(/shrink-0/);

    // Right identity cluster allows the email to shrink (min-w-0) instead of squeezing the nav.
    const headerRow = container.querySelector("header div > div");
    expect(headerRow?.className).toMatch(/min-w-0|gap-2/);
    const identity = logout.parentElement;
    expect(identity?.className).toMatch(/min-w-0/);
  });

  it("mobile menu remains available when space is insufficient", async () => {
    stubSession(demoUser);
    renderNav();
    await screen.findByText("demo@insightflow.local");
    expect(screen.getByRole("button", { name: /open navigation|close navigation|menu/i })).toBeDefined();
  });
});
