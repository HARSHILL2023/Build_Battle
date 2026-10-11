import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`bg-surface border border-line rounded-md ${className}`}>
      {children}
    </section>
  );
}

export function CardHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 border-b border-line">
      <div>
        <h2 className="font-display font-semibold text-lg leading-snug">{title}</h2>
        {sub && <p className="text-sm text-muted mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">{eyebrow}</p>
      <div className="flex flex-wrap items-end justify-between gap-4 mt-1">
        <div className="max-w-2xl">
          <h1 className="font-display font-semibold text-3xl tracking-tight">{title}</h1>
          {description && <p className="text-ink-soft mt-2 leading-relaxed">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2 no-print">{actions}</div>}
      </div>
    </div>
  );
}

type ButtonVariant = "outline" | "solid" | "subtle" | "danger-outline";

export function Button({
  variant = "outline",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const base =
    "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-md border transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50";
  const styles: Record<ButtonVariant, string> = {
    outline: "border-line-strong bg-surface text-ink hover:border-ink hover:bg-paper",
    solid: "border-ink bg-ink text-paper hover:bg-ink-soft",
    subtle: "border-transparent text-ink-soft hover:border-line hover:bg-paper",
    "danger-outline": "border-line-strong bg-surface text-danger hover:border-danger",
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
}

export function StatCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="font-display font-semibold text-3xl mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-sm text-muted mt-1">{sub}</p>}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="block bg-surface border border-line rounded-md p-4 hover:border-ink transition-colors"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="bg-surface border border-line rounded-md p-4">
      {inner}
    </div>
  );
}

const SENTIMENT_STYLES: Record<string, string> = {
  positive: "bg-good-wash text-good border-good/30",
  neutral: "bg-warn-wash text-warn border-warn/30",
  negative: "bg-danger-wash text-danger border-danger/30",
};

export function SentimentBadge({ value }: { value: string | null }) {
  if (!value) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border border-line-strong text-muted bg-paper">
        unanalyzed
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${SENTIMENT_STYLES[value] ?? "bg-paper text-muted border-line-strong"}`}
    >
      {value}
    </span>
  );
}

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-danger-wash text-danger border-danger/30",
  medium: "bg-warn-wash text-warn border-warn/30",
  low: "bg-paper text-muted border-line-strong",
};

export function PriorityBadge({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full border ${PRIORITY_STYLES[value] ?? PRIORITY_STYLES.low}`}
    >
      {value} priority
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  open: "bg-paper text-ink border-line-strong",
  in_progress: "bg-accent-wash text-accent-deep border-accent/30",
  resolved: "bg-good-wash text-good border-good/30",
  pending: "bg-paper text-muted border-line-strong",
  analyzed: "bg-accent-wash text-accent-deep border-accent/30",
  failed: "bg-danger-wash text-danger border-danger/30",
};

export function StatusBadge({ value }: { value: string }) {
  const label = value.replace(/_/g, " ");
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${STATUS_STYLES[value] ?? STATUS_STYLES.open}`}
    >
      {label}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-12">
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-paper border border-line mb-3" aria-hidden>
        <Inbox size={20} className="text-muted" />
      </span>
      <h3 className="font-display font-semibold text-lg">{title}</h3>
      <p className="text-sm text-muted mt-1 max-w-md">{description}</p>
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-12" role="alert">
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger-wash border border-danger/30 mb-3" aria-hidden>
        <AlertTriangle size={20} className="text-danger" />
      </span>
      <h3 className="font-display font-semibold text-lg">Something went wrong</h3>
      <p className="text-sm text-muted mt-1 max-w-md">{message}</p>
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="px-5 py-4 space-y-3" aria-label="Loading" role="status">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-neutral-wash animate-pulse" style={{ width: `${92 - i * 9}%` }} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export const inputClass =
  "w-full px-3 py-2 text-sm bg-surface border border-line-strong rounded-md placeholder:text-faint focus:border-accent";
export const labelClass = "block text-xs font-semibold uppercase tracking-[0.06em] text-muted mb-1.5";
