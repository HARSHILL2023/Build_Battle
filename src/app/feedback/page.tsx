"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, Trash2, Upload, X } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  SentimentBadge,
  StatusBadge,
  inputClass,
  labelClass,
} from "@/components/ui";
import { fmtInt } from "@/lib/format";

const CATEGORIES = ["Product Feedback", "Customer Service", "Fraud and Scam", "Operational Issues", "Other"];

interface FeedbackItem {
  id: number;
  review_text: string;
  source_category: string;
  norm_hash: string;
  sentiment: string | null;
  sentiment_method: string | null;
  topics: string;
  analysis_status: string;
  source: string;
  created_at: string;
}

interface ListResponse {
  data: FeedbackItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface ImportSummary {
  importId: number;
  filename: string;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  errorRows: number;
  errors: { row: number; message: string }[];
}

function Explorer() {
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [sentiment, setSentiment] = useState(searchParams.get("sentiment") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [topic, setTopic] = useState(searchParams.get("topic") ?? "");
  const [hash, setHash] = useState(searchParams.get("hash") ?? "");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<FeedbackItem | null>(null);
  const [copies, setCopies] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [review, setReview] = useState("");
  const [newCategory, setNewCategory] = useState(CATEGORIES[0]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const fetchList = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          q,
          category,
          sentiment,
          status,
          topic,
          hash,
          sort,
          page: String(pageNum),
          pageSize: "20",
        });
        const res = await fetch(`/api/feedback?${params}`);
        if (!res.ok) throw new Error();
        setResult((await res.json()) as ListResponse);
        setPage(pageNum);
    } catch {
        setError("Could not load feedback. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [q, category, sentiment, status, topic, hash, sort]
  );

  useEffect(() => {
    void Promise.resolve().then(() => fetchList(1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = async (item: FeedbackItem) => {
    setSelected(item);
    setDetailOpen(true);
    setCopies(null);
    try {
      const res = await fetch(`/api/feedback?hash=${item.norm_hash}&pageSize=5`);
      if (res.ok) {
        const body = (await res.json()) as ListResponse;
        setCopies(body.total);
      }
    } catch {
      setCopies(null);
    }
  };

  const doUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setSummary(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: form });
      const body = (await res.json()) as ImportSummary & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Import failed.");
      setSummary(body);
      fetchList(1);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setUploading(false);
    }
  };

  const doSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFormOk(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review, category: newCategory }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not save feedback.");
      setReview("");
      setFormOk("Feedback saved and queued for analysis.");
      fetchList(1);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not save feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  const doDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/feedback/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setConfirmDelete(null);
      if (selected?.id === id) setDetailOpen(false);
      fetchList(page);
    } catch {
      setError("Could not delete feedback. Try again.");
    }
  };

  const activeFilters = [category, sentiment, status, topic, hash].filter(Boolean).length + (q ? 1 : 0);

  return (
    <>
      <PageHeader
        eyebrow="Feedback workspace"
        title="Feedback Explorer"
        description="Search, filter, and inspect every stored record. Original text is always preserved; AI labels are shown separately and never overwrite the source."
      />

      {summary && (
        <div className="rounded-lg border border-accent/40 bg-accent-wash px-4 py-3 mb-4 text-sm" role="status">
          <p className="font-semibold text-accent-deep">
            Imported {fmtInt(summary.importedRows)} of {fmtInt(summary.totalRows)} rows from {summary.filename}.
          </p>
          <p className="text-accent-deep mt-0.5">
            {fmtInt(summary.duplicateRows)} duplicates preserved and flagged · {summary.errorRows} rows rejected
            {summary.errors.length > 0 && ` (e.g. row ${summary.errors[0].row}: ${summary.errors[0].message})`}.
          </p>
        </div>
      )}
      {uploadError && (
        <div className="rounded-lg border border-danger/40 bg-danger-wash px-4 py-3 mb-4 text-sm text-danger" role="alert">
          {uploadError}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card className="lg:col-span-2">
          <form
            className="px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              fetchList(1);
            }}
          >
            <div className="flex flex-col sm:flex-row gap-2">
              <label className="sr-only" htmlFor="search">Search feedback text</label>
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
                <input
                  id="search"
                  className={`${inputClass} pl-9`}
                  placeholder="Search feedback text…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <Button type="submit" variant="solid">
                Search
              </Button>
              {activeFilters > 0 && (
                <Button
                  type="button"
                  variant="subtle"
                  onClick={() => {
                    setQ("");
                    setCategory("");
                    setSentiment("");
                    setStatus("");
                    setTopic("");
                    setHash("");
                  }}
                >
                  Clear ({activeFilters})
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
              <div>
                <label className={labelClass} htmlFor="f-cat">Category</label>
                <select id="f-cat" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">All</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="f-sent">Sentiment</label>
                <select id="f-sent" className={inputClass} value={sentiment} onChange={(e) => setSentiment(e.target.value)}>
                  <option value="">All</option>
                  <option value="positive">Positive</option>
                  <option value="neutral">Neutral</option>
                  <option value="negative">Negative</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="f-status">Analysis</label>
                <select id="f-status" className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="analyzed">Analyzed</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="f-sort">Order</label>
                <select id="f-sort" className={inputClass} value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button type="button" variant="outline" className="w-full" onClick={() => fetchList(1)}>
                  Apply
                </Button>
              </div>
            </div>
            {hash && (
              <p className="text-xs text-muted mt-2">
                Showing exact copies of one pattern.{" "}
                <button type="button" className="underline underline-offset-2" onClick={() => setHash("")}>
                  Show all records
                </button>
              </p>
            )}
            {topic && (
              <p className="text-xs text-muted mt-2">
                Filtered to topic <span className="font-mono">{topic}</span>.{" "}
                <button type="button" className="underline underline-offset-2" onClick={() => setTopic("")}>
                  Show all records
                </button>
              </p>
            )}
          </form>
        </Card>

        <Card>
          <div className="px-5 py-4">
            <h2 className="font-display font-semibold">Add feedback</h2>
            <form onSubmit={doSubmit} className="mt-2 space-y-2.5">
              <div>
                <label className={labelClass} htmlFor="new-review">Review text</label>
                <textarea
                  id="new-review"
                  className={`${inputClass} min-h-20`}
                  placeholder="Paste or type customer feedback…"
                  value={review}
                  onChange={(e) => setReview(e.target.value)}
                  maxLength={2000}
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="new-cat">Category</label>
                <select id="new-cat" className={inputClass} value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              {formError && <p className="text-sm text-danger" role="alert">{formError}</p>}
              {formOk && <p className="text-sm text-good" role="status">{formOk}</p>}
              <Button type="submit" variant="solid" disabled={submitting || review.trim().length < 3} className="w-full">
                {submitting ? "Saving…" : "Submit feedback"}
              </Button>
            </form>
            <div className="rule mt-4 pt-3">
              <label className={labelClass} htmlFor="csv-upload">Import CSV</label>
              <label
                className={`flex items-center justify-center gap-2 px-3 py-2 text-sm border border-dashed border-line-strong rounded-md cursor-pointer hover:border-ink ${uploading ? "opacity-50 pointer-events-none" : ""}`}
              >
                <Upload size={15} />
                {uploading ? "Importing…" : "Choose a .csv file"}
                <input
                  id="csv-upload"
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(e) => doUpload(e.target.files?.[0])}
                />
              </label>
              <p className="text-xs text-faint mt-1.5">Requires review and category columns. Max 8 MB, 20,000 rows.</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        {loading ? (
          <LoadingRows rows={8} />
        ) : error && !result ? (
          <ErrorState message={error} onRetry={() => fetchList(page)} />
        ) : result && result.data.length === 0 ? (
          <EmptyState
            title="No feedback matches"
            description="Try a different search term or clear the filters. If the workspace is empty, import the official dataset or submit feedback above."
            action={
              <Button variant="outline" onClick={() => { setQ(""); setCategory(""); setSentiment(""); setStatus(""); setTopic(""); setHash(""); }}>
                Clear filters
              </Button>
            }
          />
        ) : result ? (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Feedback</th>
                    <th scope="col">Category</th>
                    <th scope="col">Sentiment</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((item) => (
                    <tr key={item.id}>
                      <td className="max-w-md">
                        <button type="button" onClick={() => openDetail(item)} className="text-left hover:underline underline-offset-4 line-clamp-2">
                          {item.review_text}
                        </button>
                      </td>
                      <td className="whitespace-nowrap text-ink-soft">{item.source_category}</td>
                      <td><SentimentBadge value={item.sentiment} /></td>
                      <td><StatusBadge value={item.analysis_status} /></td>
                      <td className="whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(item.id)}
                          className="inline-flex items-center gap-1 text-xs text-muted hover:text-danger px-2 py-1 rounded border border-transparent hover:border-line"
                          aria-label={`Delete feedback ${item.id}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-line text-sm">
              <p className="text-muted tabular-nums">
                {fmtInt(result.total)} record{result.total === 1 ? "" : "s"} · page {result.page} of {result.totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" disabled={result.page <= 1} onClick={() => fetchList(result.page - 1)} aria-label="Previous page">
                  <ChevronLeft size={15} />
                </Button>
                <Button variant="outline" disabled={result.page >= result.totalPages} onClick={() => fetchList(result.page + 1)} aria-label="Next page">
                  <ChevronRight size={15} />
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </Card>

      {detailOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Feedback detail">
          <button aria-label="Close detail" className="absolute inset-0 bg-ink/40" onClick={() => setDetailOpen(false)} />
          <div className="relative bg-surface border border-line-strong rounded-md shadow-[0_8px_30px_rgba(33,28,21,0.18)] max-w-xl w-full max-h-[85vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display font-semibold text-xl">Feedback #{selected.id}</h2>
              <button onClick={() => setDetailOpen(false)} className="p-1.5 rounded border border-line-strong hover:border-ink" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <blockquote className="mt-3 pl-4 border-l-2 border-accent text-[15px] leading-relaxed">
              {selected.review_text}
            </blockquote>
            <dl className="grid grid-cols-2 gap-3 mt-4 text-sm">
              <div><dt className="text-muted text-xs uppercase tracking-wide">Source category</dt><dd className="font-medium">{selected.source_category}</dd></div>
              <div><dt className="text-muted text-xs uppercase tracking-wide">Sentiment</dt><dd><SentimentBadge value={selected.sentiment} /></dd></div>
              <div><dt className="text-muted text-xs uppercase tracking-wide">Analysis method</dt><dd className="font-mono text-xs">{selected.sentiment_method ?? "not analyzed"}</dd></div>
              <div><dt className="text-muted text-xs uppercase tracking-wide">Status</dt><dd><StatusBadge value={selected.analysis_status} /></dd></div>
              <div><dt className="text-muted text-xs uppercase tracking-wide">Topics</dt><dd>{parseTopics(selected.topics)}</dd></div>
              <div><dt className="text-muted text-xs uppercase tracking-wide">Identical copies</dt><dd className="font-semibold tabular-nums">{copies === null ? "…" : `${fmtInt(copies)}×`}</dd></div>
            </dl>
            <p className="text-xs text-faint mt-3">
              Source category is the original label from import. Sentiment and topics are analytical predictions, not verified facts.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button variant="outline" onClick={() => { setDetailOpen(false); setHash(selected.norm_hash); setPage(1); fetchList(1); }}>
                View all copies
              </Button>
              <Button variant="danger-outline" onClick={() => setConfirmDelete(selected.id)}>
                <Trash2 size={14} /> Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-label="Confirm deletion">
          <button aria-label="Cancel" className="absolute inset-0 bg-ink/40" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-surface border border-line-strong rounded-md shadow-[0_8px_30px_rgba(33,28,21,0.18)] max-w-sm w-full p-6">
            <h2 className="font-display font-semibold text-lg">Delete this record?</h2>
            <p className="text-sm text-muted mt-1">The original feedback will be permanently removed. This cannot be undone.</p>
            <div className="flex gap-2 mt-4">
              <Button variant="subtle" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="danger-outline" onClick={() => doDelete(confirmDelete)}>Delete record</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function parseTopics(raw: string): string {
  try {
    const arr = JSON.parse(raw) as string[];
    return arr.length > 0 ? arr.join(", ") : "None";
  } catch {
    return "None";
  }
}

export default function FeedbackPage() {
  return (
    <Suspense>
      <Explorer />
    </Suspense>
  );
}
