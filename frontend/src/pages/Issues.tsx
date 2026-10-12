import { Link, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  PriorityBadge,
  StatusBadge,
  inputClass,
  labelClass,
} from "../components/ui";
import { fmtInt } from "../lib/format";
import { fetchJson } from "../api/client";

export interface Issue {
  id: number;
  title: string;
  description: string;
  category: string;
  primary_topic: string;
  frequency_raw: number;
  frequency_unique: number;
  negative_count: number;
  priority_score: number;
  priority_band: string;
  priority_explanation: string;
  recommendation: string;
  status: string;
  updated_at: string;
}

export default function Issues() {
  const [searchParams] = useSearchParams();
  const [band, setBand] = useState(searchParams.get("band") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchJson<{ issues: Issue[] }>(`/api/issues${status ? `?status=${status}` : ""}`);
      let list = res.issues;
      if (band) list = list.filter((i) => i.priority_band === band);
      setIssues(list);
    } catch {
      setError("Could not load issues. Try again.");
    } finally {
      setLoading(false);
    }
  }, [status, band]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Prioritization"
        title="Priority Issues"
        description="Issues are generated from analyzed feedback and scored transparently: 45% relative frequency, 35% negative share, 20% topic severity. Statuses persist across re-runs."
      />

      <Card className="mb-4">
        <form
          className="px-5 py-3.5 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <div>
            <label className={labelClass} htmlFor="band">Priority</label>
            <select id="band" className={inputClass} value={band} onChange={(e) => setBand(e.target.value)}>
              <option value="">All priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="istatus">Status</label>
            <select id="istatus" className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <Button type="submit" variant="outline">Apply</Button>
          <p className="text-xs text-muted ml-auto max-w-xs">
            Estimated impact is not shown: the data measures complaint frequency and sentiment, not revenue or churn.
          </p>
        </form>
      </Card>

      {loading ? (
        <Card><LoadingRows rows={6} /></Card>
      ) : error ? (
        <Card><ErrorState message={error} onRetry={load} /></Card>
      ) : issues.length === 0 ? (
        <Card>
          <EmptyState
            title="No issues match"
            description="Run analysis in AI Insights to generate issues, or clear the filters above."
            action={<Link to="/insights" className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-md border border-ink bg-ink text-paper">Go to AI Insights <ArrowRight size={15} /></Link>}
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {issues.map((issue) => (
            <Card key={issue.id}>
              <div className="px-5 py-4">
                <div className="flex items-start justify-between gap-2">
                  <PriorityBadge value={issue.priority_band} />
                  <StatusBadge value={issue.status} />
                </div>
                <Link to={`/issues/${issue.id}`} className="font-display font-semibold text-lg leading-snug hover:underline underline-offset-4 block mt-2">
                  {issue.title}
                </Link>
                <p className="text-sm text-muted mt-1 line-clamp-2">{issue.description}</p>
                <p className="text-sm mt-2 line-clamp-2"><span className="font-semibold">Recommended:</span> {issue.recommendation}</p>
                <div className="flex items-center justify-between mt-3 text-xs text-faint tabular-nums">
                  <span>{fmtInt(issue.frequency_raw)} records · {fmtInt(issue.frequency_unique)} unique · score {issue.priority_score}/100</span>
                  <Link to={`/issues/${issue.id}`} className="inline-flex items-center gap-1 text-accent-deep font-medium hover:underline underline-offset-4">
                    Evidence <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
