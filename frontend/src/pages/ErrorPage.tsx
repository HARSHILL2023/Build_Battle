import { Link, useNavigate, useRouteError } from "react-router-dom";

export default function ErrorPage() {
  const navigate = useNavigate();
  const err = useRouteError() as { message?: string } | null;

  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">Something failed</p>
      <h1 className="font-display font-semibold text-3xl tracking-tight mt-1">This section could not load</h1>
      <p className="text-ink-soft mt-2 max-w-xl leading-relaxed">
        An unexpected error interrupted this page. Stored data is kept in the server database and is not affected
        by reloading the view.
      </p>
      {import.meta.env.DEV && err?.message && (
        <pre className="mt-4 text-xs font-mono bg-paper border border-line rounded-md p-3 table-scroll max-w-2xl">
          {err.message}
        </pre>
      )}
      <div className="flex flex-wrap gap-2 mt-5">
        <button
          type="button"
          onClick={() => navigate(0)}
          className="inline-flex items-center px-3.5 py-2 text-sm font-medium rounded-md border border-ink bg-ink text-paper hover:bg-ink-soft"
        >
          Try again
        </button>
        <Link
          to="/"
          className="inline-flex items-center px-3.5 py-2 text-sm font-medium rounded-md border border-line-strong bg-surface hover:border-ink"
        >
          Back to overview
        </Link>
      </div>
    </>
  );
}
