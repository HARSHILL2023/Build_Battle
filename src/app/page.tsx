"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Database, FlaskConical, Upload } from "lucide-react";
import { Card, CardHeader, EmptyState, ErrorState, LoadingRows, PageHeader, SentimentBadge, PriorityBadge, StatCard } from "@/components/ui";
import { HorizontalBars, SentimentDonut } from "@/components/charts";
import { fmtInt, fmtPct, timeAgo } from "@/lib/format";
import type { DashboardMetrics } from "@/lib/metrics";

interface IssueSummary {
  id: number;
  title: string;
  priority_score: number;
  priority_band: string;
  frequency_raw: number;
  negative_count: number;
  status: string;
  recommendation: string;
}

export default function OverviewPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [recent, setRecent] = useState<{ id: number; review_text: string; source_category: string; sentiment: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, iRes, fRes] = await Promise.all([
        fetch("/api/metrics"),
        fetch("/api/issues?status=open"),
        fetch("/api/feedback?pageSize=8&sort=newest"),
      ]);
      if (!mRes.ok || !iRes.ok || !fRes.ok) throw new Error("One or more requests failed.");
      const m = (await mRes.json()) as DashboardMetrics;
      const i = (await iRes.json()) as { issues: IssueSummary[] };
      const f = (await fRes.json()) as { data: typeof recent };
      setMetrics(m);
      setIssues(i.issues.slice(0, 5));
      setRecent(f.data);
    } catch {
      setError("Could not load workspace data. Check that the server is running and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const loadSample = async (kind: "official-500" | "official-full") => {
    setSeeding(kind);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sample: kind }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Sample import failed.");
      }
      await load();
      router.push("/insights");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sample import failed.");
    } finally {
      setSeeding(null);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Workspace overview" title="Overview" />
        <Card>
          <LoadingRows rows={8} />
        </Card>
      </>
    );
  }

  if (error && !metrics) {
    return (
      <>
        <PageHeader eyebrow="Workspace overview" title="Overview" />
        <Card>
          <ErrorState message={error} onRetry={load} />
        </Card>
      </>
    );
  }

  if (metrics && metrics.totalRecords === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Workspace overview"
          title="Start with real feedback"
          description="InsightFlow is empty. Load the official Build Battle dataset to begin, or add your own CSV in the Feedback workspace."
        />
        <Card>
          <EmptyState
            title="No feedback yet"
            description="The official dataset contains about 7,000 reviews across four categories. Loading it takes a few seconds, and every record is preserved."
            action={
              <>
                <button
                  type="button"
                  onClick={() => loadSample("official-500")}
                  disabled={seeding !== null}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-md border border-ink bg-ink text-paper hover:bg-ink-soft disabled:opacity-50"
                >
                  <FlaskConical size={15} />
                  {seeding === "official-500" ? "Loading…" : "Load 500-row sample"}
                </button>
                <button
                  type="button"
                  onClick={() => loadSample("official-full")}
                  disabled={seeding !== null}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-md border border-line-strong bg-surface hover:border-ink disabled:opacity-50"
                >
                  <Database size={15} />
                  {seeding === "official-full" ? "Loading…" : "Load full dataset (7,000)"}
                </button>
                <Link
                  href="/feedback"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-md border border-transparent text-ink-soft hover:border-line"
                >
                  <Upload size={15} />
                  Import your own CSV
                </Link>
              </>
            }
          />
        </Card>
      </>
    );
  }

  const m = metrics!;
  const analyzedShare = m.totalRecords ? Math.round((m.analyzed / m.totalRecords) * 100) : 0;
  const highIssues = issues.filter((i) => i.priority_band === "high");

  return (
    <>
      <PageHeader
        eyebrow="Workspace overview"
        title="Overview"
        description={`${fmtInt(m.totalRecords)} records${m.imports > 0 ? ` from ${m.imports} import${m.imports === 1 ? "" : "s"}` : ""}${m.lastImportAt ? `, last import ${timeAgo(m.lastImportAt)}` : ""}. Every figure below is computed from stored records.`}
        actions={
          <Link
            href="/feedback"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-md border border-line-strong bg-surface hover:border-ink"
          >
            Open feedback workspace <ArrowRight size={15} />
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Feedback records" value={fmtInt(m.totalRecords)} sub={`${fmtInt(m.uniquePatterns)} unique patterns`} href="/feedback" />
        <StatCard label="Duplicates folded" value={fmtInt(m.duplicateRecords)} sub={`${fmtPct(m.duplicateRecords, m.totalRecords)} of volume is repetition`} href="/insights" />
        <StatCard label="Negative feedback" value={fmtInt(m.sentiment.negative)} sub={`${fmtPct(m.sentiment.negative, m.totalRecords)} of all records`} href="/feedback?sentiment=negative" />
        <StatCard label="High-priority issues" value={fmtInt(m.issues.high)} sub={`${fmtInt(m.issues.open)} open issues total`} href="/issues" />
      </div>

      <div className="rounded-lg border border-line bg-surface px-4 py-3 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span>
          <strong className="font-semibold">Data quality: grade {m.quality.grade}</strong>
          <span className="text-muted"> ({m.quality.score}/10)</span>
        </span>
        <span className="text-muted">
          {m.analyzed > 0 ? `${analyzedShare}% analyzed` : "Not yet analyzed"}
          {m.pending > 0 && ` · ${fmtInt(m.pending)} pending`}
        </span>
        <span className="text-muted">Source categories are preserved as-is, not AI-verified.</span>
        <Link href="/insights" className="ml-auto inline-flex items-center gap-1 text-accent-deep font-medium hover:underline underline-offset-4">
          How this is computed <ArrowRight size={14} />
        </Link>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader title="Sentiment distribution" sub="Select a segment to inspect its records." />
          <div className="px-5 py-4">
            {m.analyzed === 0 ? (
              <p className="text-sm text-muted">
                No analyzed records yet.{" "}
                <Link href="/insights" className="text-accent-deep font-medium hover:underline underline-offset-4">
                  Run analysis
                </Link>{" "}
                to classify sentiment.
              </p>
            ) : (
              <>
                <SentimentDonut
                  data={[
                    { name: "positive", value: m.sentiment.positive },
                    { name: "neutral", value: m.sentiment.neutral },
                    { name: "negative", value: m.sentiment.negative },
                  ]}
                  onSelect={(s) => router.push(`/feedback?sentiment=${s}`)}
                />
                <ul className="flex flex-wrap gap-4 text-sm mt-1">
                  {(["positive", "neutral", "negative"] as const).map((s) => (
                    <li key={s}>
                      <Link href={`/feedback?sentiment=${s}`} className="hover:underline underline-offset-4">
                        <SentimentBadge value={s} /> <span className="font-semibold tabular-nums">{fmtInt(m.sentiment[s])}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Records by category" sub="Select a bar to filter feedback." />
          <div className="px-5 py-4">
            <HorizontalBars
              data={m.byCategory.map((c) => ({ name: c.category, value: c.total }))}
              onSelect={(name) => router.push(`/feedback?category=${encodeURIComponent(name)}`)}
              ariaLabel="Feedback records by category"
            />
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader
            title="Most repeated patterns"
            sub="Exact duplicates folded. Select a row to see every copy."
            action={
              <Link href="/insights" className="text-sm text-accent-deep font-medium hover:underline underline-offset-4 no-print">
                All insights
              </Link>
            }
          />
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Feedback</th>
                  <th scope="col">Copies</th>
                  <th scope="col">Sentiment</th>
                </tr>
              </thead>
              <tbody>
                {m.topPatterns.slice(0, 6).map((p) => (
                  <tr key={p.hash}>
                    <td>
                      <Link href={`/feedback?hash=${p.hash}`} className="hover:underline underline-offset-4 line-clamp-2">
                        {p.review}
                      </Link>
                      <span className="block text-xs text-muted mt-0.5">{p.category}</span>
                    </td>
                    <td className="tabular-nums font-semibold whitespace-nowrap">{fmtInt(p.count)}×</td>
                    <td>
                      <SentimentBadge value={p.sentiment} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={highIssues.length > 0 ? "Needs attention first" : "Top open issues"}
            sub="Evidence-backed, scored from actual records."
            action={
              <Link href="/issues" className="text-sm text-accent-deep font-medium hover:underline underline-offset-4 no-print">
                All issues
              </Link>
            }
          />
          <ul className="divide-y divide-line">
            {(highIssues.length > 0 ? highIssues : issues).slice(0, 4).map((issue) => (
              <li key={issue.id} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/issues/${issue.id}`} className="font-medium hover:underline underline-offset-4 leading-snug">
                    {issue.title}
                  </Link>
                  <PriorityBadge value={issue.priority_band} />
                </div>
                <p className="text-sm text-muted mt-1 line-clamp-2">{issue.recommendation}</p>
                <p className="text-xs text-faint mt-1 tabular-nums">
                  {fmtInt(issue.frequency_raw)} records · {fmtInt(issue.negative_count)} negative · score {issue.priority_score}/100
                </p>
              </li>
            ))}
            {issues.length === 0 && (
              <li className="px-5 py-6 text-sm text-muted">
                No issues yet.{" "}
                <Link href="/insights" className="text-accent-deep font-medium hover:underline underline-offset-4">
                  Run analysis
                </Link>{" "}
                to generate prioritized issues from your feedback.
              </li>
            )}
          </ul>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Recent feedback"
          sub="Latest records added to this workspace."
          action={
            <Link href="/feedback" className="text-sm text-accent-deep font-medium hover:underline underline-offset-4 no-print">
              View all
            </Link>
          }
        />
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Feedback</th>
                <th scope="col">Category</th>
                <th scope="col">Sentiment</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((f) => (
                <tr key={f.id}>
                  <td className="max-w-md">
                    <span className="line-clamp-2">{f.review_text}</span>
                  </td>
                  <td className="whitespace-nowrap text-ink-soft">{f.source_category}</td>
                  <td>
                    <SentimentBadge value={f.sentiment} />
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-muted">
                    No records yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-faint mt-4">
        No invented comparisons are shown here. The source data contains no review timestamps, so trend lines are
        intentionally absent; see AI Insights for the full list of analytical limitations.
      </p>
    </>
  );
}
