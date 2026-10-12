import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">Error 404</p>
      <h1 className="font-display font-semibold text-3xl tracking-tight mt-1">This page does not exist</h1>
      <p className="text-ink-soft mt-2 max-w-xl leading-relaxed">
        The address may be mistyped, or the item was deleted. Your stored feedback and issues are unaffected.
      </p>
      <div className="flex flex-wrap gap-2 mt-5">
        <Link
          to="/"
          className="inline-flex items-center px-3.5 py-2 text-sm font-medium rounded-md border border-ink bg-ink text-paper hover:bg-ink-soft"
        >
          Back to overview
        </Link>
        <Link
          to="/feedback"
          className="inline-flex items-center px-3.5 py-2 text-sm font-medium rounded-md border border-line-strong bg-surface hover:border-ink"
        >
          Open feedback
        </Link>
      </div>
    </>
  );
}
