/** Component tests for shared loading / empty / error / retry states. */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EmptyState, ErrorState, LoadingRows, StatCard } from "./components/ui";

describe("shared states", () => {
  it("LoadingRows announces a loading status", () => {
    render(<LoadingRows rows={3} />);
    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.getByText(/loading/i)).toBeDefined();
  });

  it("EmptyState shows title, description and action", () => {
    render(
      <MemoryRouter>
        <EmptyState title="Nothing here" description="Import first." action={<button>Go</button>} />
      </MemoryRouter>
    );
    expect(screen.getByText("Nothing here")).toBeDefined();
    expect(screen.getByText("Import first.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Go" })).toBeDefined();
  });

  it("ErrorState shows message and retry button that fires onRetry", () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Boom." onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText("Boom.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("ErrorState without onRetry shows no retry button", () => {
    render(<ErrorState message="Boom." />);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });

  it("StatCard links when href is given", () => {
    render(
      <MemoryRouter>
        <StatCard label="Records" value="1,234" sub="sub" href="/feedback" />
      </MemoryRouter>
    );
    expect(screen.getByRole("link").getAttribute("href")).toBe("/feedback");
    expect(screen.getByText("1,234")).toBeDefined();
  });
});
