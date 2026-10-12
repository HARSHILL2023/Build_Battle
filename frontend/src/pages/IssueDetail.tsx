import { Link, useParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Quote } from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  LoadingRows,
  PageHeader,
  PriorityBadge,
  ReadOnlyNotice,
  SentimentBadge,
  StatusBadge,
} from "../components/ui";
import { fmtInt } from "../lib/format";
import { fetchJson, apiPatchJson } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Issue } from "./Issues";

interface Evidence {
  id: number;
  review_text: string;
  source_category: string;
  sentiment: string | null;
}

type IssueDetail = Issue & { evidence_ids: string; created_at: string };

export default function IssueDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const readOnly = user?.isDemo === true;
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await fetchJson<{ issue: IssueDetail; evidence: Evidence[] }>(`/api/issues/${id}`);
      setIssue(body.issue);
      setEvidence(body.evidence);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load issue.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) void load();
  }, [id, load]);

  const setStatus = async (status: string) => {
    setSaving(true);
    try {
      await apiPatchJson(`/api/issues/${id}`, { status });
      await load();
    } catch {
      setError("Could not update status. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Issue detail" title="Loading…" />
        <Card><LoadingRows rows={6} /></Card>
      </>
    );
  }
  if (error || !issue) {
    return (
      <>
        <PageHeader eyebrow="Issue detail" title="Issue" />
        <Card><ErrorState message={error ?? "Issue not found."} onRetry={load} /></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Issue detail"
        title={issue.title}
        description={issue.description}
        actions={
          <Link to="/issues" className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-md border border-line-strong bg-surface hover:border-ink">
            <ArrowLeft size={15} /> All issues
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <PriorityBadge value={issue.priority_band} />
        <StatusBadge value={issue.status} />
        <span className="text-sm text-muted tabular-nums ml-1">Score {issue.priority_score}/100</span>
        <div className="ml-auto flex gap-2 no-print">
          {(["open", "in_progress", "resolved"] as const).map((s) => (
            <Button
              key={s}
              variant={issue.status === s ? "solid" : "outline"}
              disabled={saving || readOnly || issue.status === s}
              onClick={() => setStatus(s)}
              title={readOnly ? "Demo mode is read-only" : undefined}
              className="text-xs px-2.5 py-1.5"
            >
              {s.replace("_", " ")}
            </Button>
          ))}
        </div>
        {readOnly && (
          <div className="mb-4 max-w-xl"><ReadOnlyNotice /></div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Why this deserves attention" />
          <div className="px-5 py-4 text-sm space-y-3">
            <p>{issue.priority_explanation}</p>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="border border-line rounded-md p-2.5">
                <dt className="text-xs text-muted">Records</dt>
                <dd className="font-display font-semibold text-2xl tabular-nums">{fmtInt(issue.frequency_raw)}</dd>
              </div>
              <div className="border border-line rounded-md p-2.5">
                <dt className="text-xs text-muted">Unique</dt>
                <dd className="font-display font-semibold text-2xl tabular-nums">{fmtInt(issue.frequency_unique)}</dd>
              </div>
              <div className="border border-line rounded-md p-2.5">
                <dt className="text-xs text-muted">Negative</dt>
                <dd className="font-display font-semibold text-2xl tabular-nums">{fmtInt(issue.negative_count)}</dd>
              </div>
            </dl>
            <p className="text-xs text-faint">
              Frequency counts every stored record, including duplicates; the unique count shows distinct complaint
              patterns. Created {issue.created_at} · updated {issue.updated_at}.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Recommended next action" />
          <div className="px-5 py-4 text-sm space-y-2.5">
            <p className="leading-relaxed">{issue.recommendation}</p>
            <p className="text-xs text-faint">
              This recommendation follows from the evidence on this page. Business impact (revenue, churn) is not
              measured by this dataset and is deliberately not estimated.
            </p>
            <Link
              to={`/feedback?topic=${issue.primary_topic}&category=${encodeURIComponent(issue.category)}`}
              className="inline-flex items-center gap-1 text-accent-deep font-medium hover:underline underline-offset-4"
            >
              Browse all matching feedback
            </Link>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Supporting evidence" sub="Representative records behind this issue. Select any row to inspect it." />
        <ul className="divide-y divide-line">
          {evidence.map((e) => (
            <li key={e.id} className="px-5 py-3.5">
              <Quote size={14} className="text-faint mb-1" aria-hidden />
              <p className="text-[15px] leading-relaxed">{e.review_text}</p>
              <div className="flex items-center gap-2 mt-1.5 text-xs text-muted">
                <span>#{e.id}</span>
                <span>{e.source_category}</span>
                <SentimentBadge value={e.sentiment} />
              </div>
            </li>
          ))}
          {evidence.length === 0 && (
            <li className="px-5 py-6 text-sm text-muted">No evidence records found.</li>
          )}
        </ul>
      </Card>
    </>
  );
}
