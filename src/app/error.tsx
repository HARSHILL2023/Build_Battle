"use client";

import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">Something failed</p>
      <h1 className="font-display font-semibold text-3xl tracking-tight mt-1">This section could not load</h1>
      <p className="text-ink-soft mt-2 max-w-xl leading-relaxed">
        An unexpected error interrupted this page. Stored data is kept in the server database and is not affected
        by reloading the view.
      </p>
      {process.env.NODE_ENV === "development" && (
        <pre className="mt-4 text-xs font-mono bg-paper border border-line rounded-md p-3 overflow-x-auto max-w-2xl">
          {error.message}
        </pre>
      )}
      <div className="flex flex-wrap gap-2 mt-5">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center px-3.5 py-2 text-sm font-medium rounded-md border border-ink bg-ink text-paper hover:bg-ink-soft"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center px-3.5 py-2 text-sm font-medium rounded-md border border-line-strong bg-surface hover:border-ink"
        >
          Back to overview
        </Link>
      </div>
    </>
  );
}
