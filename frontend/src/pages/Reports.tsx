import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  PriorityBadge,
  SentimentBadge,
} from "../components/ui";
import { fmtInt, fmtPct } from "../lib/format";
import { csvUrl, fetchJson } from "../api/client";

interface ReportData {
  generatedAt: string;
  coverage: { totalRecords: number; uniquePatterns: number; duplicateRecords: number; imports: number };
  sentiment: { positive: number; neutral: number; negative: number; unanalyzed: number };
  byCategory: { category: string; total: number; negative: number; positive: number; neutral: number }[];
  byTopic: { topic: string; label: string; raw: number; unique: number; negative: number }[];
  quality: { score: number; grade: string };
  limitations: string[];
}

interface IssueRow {
  id: number;
  title: string;
  priority_band: string;
  priority_score: number;
  frequency_raw: number;
  negative_count: number;
  recommendation: string;
  status: string;
}

export default function Reports() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, i] = await Promise.all([
        fetchJson<ReportData>("/api/reports"),
        fetchJson<{ issues: IssueRow[] }>("/api/issues"),
      ]);
      setReport(r);
      setIssues(i.issues.slice(0, 10));
    } catch {
      setError("Could not build the report. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Stakeholder output" title="Reports" />
        <Card><LoadingRows rows={8} /></Card>
      </>
    );
  }
  if (error || !report) {
    return (
      <>
        <PageHeader eyebrow="Stakeholder output" title="Reports" />
        <Card><ErrorState message={error ?? "Report unavailable."} onRetry={load} /></Card>
      </>
    );
  }
  if (report.coverage.totalRecords === 0) {
    return (
      <>
        <PageHeader eyebrow="Stakeholder output" title="Reports" />
        <Card>
          <EmptyState
            title="No data to report on"
            description="Import feedback and run analysis first; the report is generated from stored records."
            action={<Link to="/feedback" className="inline-flex items-center px-3.5 py-2 text-sm font-medium rounded-md border border-ink bg-ink text-paper">Go to Feedback</Link>}
          />
        </Card>
      </>
    );
  }

  const r = report;
  const total = r.coverage.totalRecords;

  return (
    <>
      <div className="no-print">
        <PageHeader
          eyebrow="Stakeholder output"
          title="Reports"
          description={`Generated ${new Date(r.generatedAt).toLocaleString()} from ${fmtInt(total)} stored records. Use Print / Save as PDF for a clean handout, or download CSV for spreadsheets.`}
          actions={
            <>
              <a href={csvUrl("feedback")} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-md border border-line-strong bg-surface hover:border-ink" download>
                <Download size={15} /> Feedback CSV
              </a>
              <a href={csvUrl("issues")} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-md border border-line-strong bg-surface hover:border-ink" download>
                <Download size={15} /> Issues CSV
              </a>
              <Button variant="solid" onClick={() => window.print()}>
                <Printer size={15} /> Print / PDF
              </Button>
            </>
          }
        />
      </div>

      <div className="hidden print:block mb-6">
        <p className="font-display font-semibold text-3xl">InsightFlow Insight Report</p>
        <p className="text-sm text-muted">Generated {new Date(r.generatedAt).toLocaleString()} · {fmtInt(total)} records · quality grade {r.quality.grade}</p>
      </div>

      <Card className="print-card mb-4">
        <CardHeader title="Dataset coverage and quality" />
        <div className="px-5 py-4 grid sm:grid-cols-4 gap-3 text-sm">
          <div><p className="text-muted text-xs uppercase tracking-wide">Records</p><p className="font-display font-semibold text-2xl tabular-nums">{fmtInt(r.coverage.totalRecords)}</p></div>
          <div><p className="text-muted text-xs uppercase tracking-wide">Unique patterns</p><p className="font-display font-semibold text-2xl tabular-nums">{fmtInt(r.coverage.uniquePatterns)}</p></div>
          <div><p className="text-muted text-xs uppercase tracking-wide">Duplicates</p><p className="font-display font-semibold text-2xl tabular-nums">{fmtInt(r.coverage.duplicateRecords)}</p></div>
          <div><p className="text-muted text-xs uppercase tracking-wide">Quality</p><p className="font-display font-semibold text-2xl">Grade {r.quality.grade} <span className="text-sm text-muted">({r.quality.score}/10)</span></p></div>
        </div>
        <p className="px-5 pb-4 text-sm text-ink-soft">
          Raw volume overstates distinct complaints: {fmtPct(r.coverage.duplicateRecords, total)} of records repeat
          an identical review. Priority scoring counts both raw frequency and unique patterns so repetition is visible
          without being mistaken for breadth.
        </p>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card className="print-card">
          <CardHeader title="Sentiment distribution" />
          <ul className="px-5 py-4 text-sm space-y-2">
            {(["positive", "neutral", "negative"] as const).map((s) => (
              <li key={s} className="flex items-center justify-between">
                <SentimentBadge value={s} />
                <span className="tabular-nums font-semibold">{fmtInt(r.sentiment[s])} ({fmtPct(r.sentiment[s], total)})</span>
              </li>
            ))}
            {r.sentiment.unanalyzed > 0 && (
              <li className="flex items-center justify-between text-muted">
                <span>Unanalyzed</span>
                <span className="tabular-nums">{fmtInt(r.sentiment.unanalyzed)}</span>
              </li>
            )}
          </ul>
        </Card>
        <Card className="print-card">
          <CardHeader title="Most common topics" />
          <ul className="px-5 py-4 text-sm space-y-2">
            {r.byTopic.slice(0, 6).map((t) => (
              <li key={t.topic} className="flex items-center justify-between gap-3">
                <span className="font-medium">{t.label}</span>
                <span className="tabular-nums text-muted">{fmtInt(t.raw)} records · {fmtInt(t.unique)} unique</span>
              </li>
            ))}
            {r.byTopic.length === 0 && <li className="text-muted">Run analysis to detect topics.</li>}
          </ul>
        </Card>
      </div>

      <Card className="print-card mb-4">
        <CardHeader title="Priority issues and recommendations" sub="Score = 45% frequency + 35% negative share + 20% severity." />
        <ul className="divide-y divide-line">
          {issues.map((issue) => (
            <li key={issue.id} className="px-5 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{issue.title}</p>
                <PriorityBadge value={issue.priority_band} />
              </div>
              <p className="text-sm text-ink-soft mt-1">{issue.recommendation}</p>
              <p className="text-xs text-faint mt-1 tabular-nums">
                {fmtInt(issue.frequency_raw)} records · {fmtInt(issue.negative_count)} negative · score {issue.priority_score}/100 · status {issue.status.replace("_", " ")}
              </p>
            </li>
          ))}
          {issues.length === 0 && <li className="px-5 py-6 text-sm text-muted">No issues generated yet.</li>}
        </ul>
      </Card>

      <Card className="print-card">
        <CardHeader title="Limitations" />
        <ul className="px-5 py-4 text-sm list-disc pl-10 space-y-1 text-ink-soft">
          {r.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Card>

      <p className="text-xs text-faint mt-4 no-print">
        There is no public share link: reports can contain private customer feedback, so sharing is limited to CSV
        download and printing. CSV exports are guarded against spreadsheet formula injection.
      </p>
    </>
  );
}
