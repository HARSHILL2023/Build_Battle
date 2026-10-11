"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, FlaskConical, Play } from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  SentimentBadge,
  inputClass,
  labelClass,
} from "@/components/ui";
import { HorizontalBars, SentimentDonut } from "@/components/charts";
import { fmtInt, fmtPct } from "@/lib/format";
import type { DashboardMetrics } from "@/lib/metrics";

interface AdaptionStatus {
  configured: boolean;
  baseUrl: string;
  mode: string;
  rowCount: number;
  quality: {
    score: number;
    grade: string;
    domain: string;
    language: string;
    tone: string;
    rawRows: number;
    uniquePatterns: number;
    duplicateRows: number;
    duplicationRate: number;
    checks: { name: string; passed: boolean; detail: string }[];
  };
  history: { id: number; operation: string; mode: string; input_rows: number; status: string; created_at: string }[];
}

interface PipelineSummary {
  runId: number;
  method: string;
  adaptionMode: string;
  rawRows: number;
  uniquePatterns: number;
  duplicateRows: number;
  succeeded: number;
  failed: number;
  rowsUpdated: number;
  issuesCreated: number;
  qualityScore: number;
  qualityGrade: string;
  providerError: string | null;
}

export default function InsightsPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [adaption, setAdaption] = useState<AdaptionStatus | null>(null);
  const [runs, setRuns] = useState<{ id: number; method: string; total_unique: number; succeeded: number; failed: number; rows_updated: number; started_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState("auto");
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, aRes, rRes] = await Promise.all([
        fetch("/api/metrics"),
        fetch("/api/adaption"),
        fetch("/api/analyze"),
      ]);
      if (!mRes.ok || !aRes.ok || !rRes.ok) throw new Error();
      setMetrics((await mRes.json()) as DashboardMetrics);
      setAdaption((await aRes.json()) as AdaptionStatus);
      setRuns(((await rRes.json()) as { runs: typeof runs }).runs);
    } catch {
      setError("Could not load analysis data. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const runAnalysis = async () => {
    setRunning(true);
    setRunError(null);
    setSummary(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, onlyPending: false }),
      });
      const body = (await res.json()) as PipelineSummary & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Analysis failed.");
      setSummary(body);
      await load();
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Evidence workspace" title="AI Insights" />
        <Card><LoadingRows rows={8} /></Card>
      </>
    );
  }
  if (error && !metrics) {
    return (
      <>
        <PageHeader eyebrow="Evidence workspace" title="AI Insights" />
        <Card><ErrorState message={error} onRetry={load} /></Card>
      </>
    );
  }
  if (metrics && metrics.totalRecords === 0) {
    return (
      <>
        <PageHeader eyebrow="Evidence workspace" title="AI Insights" />
        <Card>
          <EmptyState
            title="Nothing to analyze yet"
            description="Import feedback first. Analysis classifies each unique pattern once, then maps the result back to every copy."
            action={<Link href="/feedback" className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-md border border-ink bg-ink text-paper">Go to Feedback <ArrowRight size={15} /></Link>}
          />
        </Card>
      </>
    );
  }

  const m = metrics!;
  const analyzed = m.analyzed > 0;

  return (
    <>
      <PageHeader
        eyebrow="Evidence workspace"
        title="AI Insights"
        description="Sentiment, recurring topics, and duplicate-aware groups, all computed from stored records. Every finding links to the feedback behind it."
      />

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card className="lg:col-span-1">
          <CardHeader title="Run analysis" sub="Classifies each unique pattern once." />
          <div className="px-5 py-4 space-y-3">
            <div>
              <label className={labelClass} htmlFor="method">Analysis method</label>
              <select id="method" className={inputClass} value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="auto">Automatic (AI when configured)</option>
                <option value="openai">AI classifier (requires key)</option>
                <option value="deterministic">Deterministic rules (offline)</option>
              </select>
            </div>
            <Button variant="solid" className="w-full" disabled={running} onClick={runAnalysis}>
              <Play size={15} /> {running ? "Analyzing…" : "Run analysis"}
            </Button>
            {running && (
              <p className="text-xs text-muted" role="status">
                Classifying unique patterns and regenerating issues. Large datasets can take a minute; do not close this page.
              </p>
            )}
            {runError && <p className="text-sm text-danger" role="alert">{runError}</p>}
            {summary && (
              <div className="text-sm rounded-md border border-accent/40 bg-accent-wash p-3" role="status">
                <p className="font-semibold text-accent-deep">Analysis complete</p>
                <ul className="text-accent-deep mt-1 space-y-0.5 tabular-nums">
                  <li>Method: <span className="font-mono text-xs">{summary.method}</span></li>
                  <li>{fmtInt(summary.uniquePatterns)} unique patterns from {fmtInt(summary.rawRows)} rows ({fmtInt(summary.duplicateRows)} duplicates folded before classification)</li>
                  <li>{fmtInt(summary.succeeded)} classified · {fmtInt(summary.failed)} fell back to rules · {fmtInt(summary.rowsUpdated)} rows updated</li>
                  <li>{fmtInt(summary.issuesCreated)} issues regenerated · quality grade {summary.qualityGrade}</li>
                </ul>
                {summary.providerError && (
                  <p className="text-accent-deep mt-2 border-t border-accent/30 pt-2">
                    <strong className="font-semibold">Provider notice:</strong> {summary.providerError} Affected items
                    used deterministic rules instead, and are labeled as such on every record.
                  </p>
                )}
              </div>
            )}
            {runs.length > 0 && (
              <div className="text-xs text-muted">
                <p className="font-semibold uppercase tracking-wide mb-1">Recent runs</p>
                <ul className="space-y-1">
                  {runs.slice(0, 4).map((r) => (
                    <li key={r.id} className="font-mono">
                      #{r.id} {r.method} · {fmtInt(r.succeeded)}/{fmtInt(r.total_unique)} ok
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Adaption preparation"
            sub="Deduplication and quality evaluation before classification."
            action={
              <Link href="/settings#adaption" className="text-sm text-accent-deep font-medium hover:underline underline-offset-4 no-print">
                Setup guide
              </Link>
            }
          />
          <div className="px-5 py-4">
            {adaption && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm mb-3">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${adaption.configured ? "bg-good-wash text-good border-good/30" : "bg-warn-wash text-warn border-warn/30"}`}>
                    <FlaskConical size={13} />
                    {adaption.configured ? "Live-capable: key configured" : "Local adapter: no key configured"}
                  </span>
                  <span className="text-muted text-xs">
                    Quality grade <strong className="text-ink">{adaption.quality.grade}</strong> ({adaption.quality.score}/10) ·{" "}
                    {fmtInt(adaption.quality.duplicateRows)} duplicates in {fmtInt(adaption.quality.rawRows)} rows
                  </span>
                </div>
                <ol className="text-sm space-y-1.5 mb-3">
                  <li><strong className="font-semibold">Sent to preparation:</strong> {fmtInt(adaption.quality.rawRows)} stored rows (review text + source category).</li>
                  <li><strong className="font-semibold">Operation:</strong> column mapping to a universal sentiment/topic prompt, then prompt deduplication into {fmtInt(adaption.quality.uniquePatterns)} unique patterns.</li>
                  <li><strong className="font-semibold">Returned:</strong> deduplicated pattern list plus a quality report (grade {adaption.quality.grade}).</li>
                  <li><strong className="font-semibold">Contribution:</strong> the classifier processes {fmtInt(adaption.quality.uniquePatterns)} patterns instead of {fmtInt(adaption.quality.rawRows)} rows, and every duplicate inherits its pattern result.</li>
                </ol>
                <ul className="text-xs text-muted space-y-1 border-t border-line pt-3">
                  {adaption.quality.checks.map((c) => (
                    <li key={c.name} className="flex gap-2">
                      <span className={`text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${c.passed ? "text-good border-good/30 bg-good-wash" : "text-warn border-warn/30 bg-warn-wash"}`}>{c.passed ? "Pass" : "Review"}</span>
                      <span><strong className="font-semibold text-ink-soft">{c.name}:</strong> {c.detail}</span>
                    </li>
                  ))}
                </ul>
                {!adaption.configured && (
                  <p className="text-xs text-muted mt-3">
                    Live Adaption runs need an API key; without one the local adapter performs the same preparation steps
                    offline. Connection status is verified, never assumed. See Settings for setup.
                  </p>
                )}
              </>
            )}
          </div>
        </Card>
      </div>

      {!analyzed ? (
        <Card>
          <EmptyState
            title="Run analysis to unlock insights"
            description="Sentiment, topics, and complaint groups appear here after the first analysis run. Use the panel above."
          />
        </Card>
      ) : (
        <>
          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <Card>
              <CardHeader title="Sentiment" sub="Analyzed records only." />
              <div className="px-5 py-4">
                <SentimentDonut
                  data={[
                    { name: "positive", value: m.sentiment.positive },
                    { name: "neutral", value: m.sentiment.neutral },
                    { name: "negative", value: m.sentiment.negative },
                  ]}
                />
                <ul className="text-sm space-y-1 mt-1">
                  {(["positive", "neutral", "negative"] as const).map((s) => (
                    <li key={s} className="flex items-center justify-between">
                      <span><SentimentBadge value={s} /></span>
                      <Link href={`/feedback?sentiment=${s}`} className="tabular-nums font-semibold hover:underline underline-offset-4">
                        {fmtInt(m.sentiment[s])} ({fmtPct(m.sentiment[s], m.analyzed)})
                      </Link>
                    </li>
                  ))}
                  {m.sentiment.unanalyzed > 0 && (
                    <li className="flex items-center justify-between text-muted">
                      <span>Unanalyzed</span>
                      <span className="tabular-nums">{fmtInt(m.sentiment.unanalyzed)}</span>
                    </li>
                  )}
                </ul>
                <p className="text-xs text-faint mt-2">Sentiment labels are model predictions, not objective truth. Inspect the records before acting.</p>
              </div>
            </Card>
            <Card>
              <CardHeader title="Recurring topics" sub="Select a topic to inspect its records." />
              <div className="px-5 py-4">
                {m.byTopic.length === 0 ? (
                  <p className="text-sm text-muted">No topics detected yet.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {m.byTopic.slice(0, 8).map((t) => (
                      <li key={t.topic} className="py-2.5 flex items-center justify-between gap-3">
                        <div>
                          <Link href={`/feedback?topic=${t.topic}`} className="font-medium hover:underline underline-offset-4">
                            {t.label}
                          </Link>
                          <p className="text-xs text-muted tabular-nums">
                            {fmtInt(t.raw)} records · {fmtInt(t.unique)} unique · {fmtInt(t.negative)} negative
                          </p>
                        </div>
                        <span className="font-display font-semibold text-xl tabular-nums">{fmtInt(t.raw)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </div>

          <Card className="mb-4">
            <CardHeader title="Category comparison" sub="Sentiment split per source category." />
            <div className="px-5 py-4">
              <HorizontalBars
                data={m.byCategory.map((c) => ({ name: `${c.category} · ${fmtInt(c.negative)} neg`, value: c.total }))}
                ariaLabel="Total records per category"
              />
              <div className="overflow-x-auto mt-2">
                <table className="data-table">
                  <thead>
                    <tr><th scope="col">Category</th><th scope="col">Records</th><th scope="col">Negative</th><th scope="col">Neutral</th><th scope="col">Positive</th></tr>
                  </thead>
                  <tbody>
                    {m.byCategory.map((c) => (
                      <tr key={c.category}>
                        <td><Link href={`/feedback?category=${encodeURIComponent(c.category)}`} className="hover:underline underline-offset-4 font-medium">{c.category}</Link></td>
                        <td className="tabular-nums">{fmtInt(c.total)}</td>
                        <td className="tabular-nums text-danger">{fmtInt(c.negative)} ({fmtPct(c.negative, c.total)})</td>
                        <td className="tabular-nums">{fmtInt(c.neutral)}</td>
                        <td className="tabular-nums text-good">{fmtInt(c.positive)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Similar feedback groups" sub="Largest exact-duplicate groups. Volume is real; distinct complaints are fewer." />
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr><th scope="col">Representative feedback</th><th scope="col">Copies</th><th scope="col">Share of volume</th><th scope="col">Sentiment</th></tr>
                </thead>
                <tbody>
                  {m.topPatterns.map((p) => (
                    <tr key={p.hash}>
                      <td className="max-w-md">
                        <Link href={`/feedback?hash=${p.hash}`} className="hover:underline underline-offset-4 line-clamp-2">{p.review}</Link>
                        <span className="block text-xs text-muted mt-0.5">{p.category}</span>
                      </td>
                      <td className="tabular-nums font-semibold">{fmtInt(p.count)}×</td>
                      <td className="tabular-nums">{fmtPct(p.count, m.totalRecords)}</td>
                      <td><SentimentBadge value={p.sentiment} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="mt-4">
            <div className="px-5 py-4 text-sm">
              <h2 className="font-display font-semibold text-lg mb-2">Analytical limitations</h2>
              <ul className="list-disc pl-5 space-y-1 text-ink-soft">
                <li>The source dataset has no sentiment labels; every sentiment value here was analyzed, not observed.</li>
                <li>The source dataset has no review timestamps, so trend and emerging-issue detection over time is unavailable and intentionally not shown.</li>
                <li>Source categories are preserved exactly as imported and are not verified AI classifications.</li>
                <li>No customer names, IDs, ratings, dates, or locations exist in the data; none are shown or inferred.</li>
                <li>Duplicate folding uses exact normalized matches; paraphrased repeats may be counted separately.</li>
              </ul>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
