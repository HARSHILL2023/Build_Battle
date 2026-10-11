"use client";

import { useCallback, useEffect, useState } from "react";
import { FlaskConical, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  LoadingRows,
  PageHeader,
} from "@/components/ui";
import { fmtInt, timeAgo } from "@/lib/format";

interface Health {
  ok: boolean;
  database: string;
  feedbackRows: number;
  openaiConfigured: boolean;
  adaptionConfigured: boolean;
  time: string;
}

interface ImportRecord {
  id: number;
  filename: string;
  total_rows: number;
  imported_rows: number;
  duplicate_rows: number;
  error_rows: number;
  errors: string;
  created_at: string;
}

export default function SettingsPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [clearing, setClearing] = useState(false);
  const [clearMsg, setClearMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [hRes, iRes] = await Promise.all([fetch("/api/health"), fetch("/api/import")]);
      if (!hRes.ok || !iRes.ok) throw new Error();
      setHealth((await hRes.json()) as Health);
      setImports(((await iRes.json()) as { imports: ImportRecord[] }).imports);
    } catch {
      setError("Could not load settings data. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const testAdaption = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/adaption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const body = (await res.json()) as { ok: boolean; message: string };
      setTestResult(body);
    } catch {
      setTestResult({ ok: false, message: "Test request failed." });
    } finally {
      setTesting(false);
    }
  };

  const clearData = async () => {
    setClearing(true);
    setClearMsg(null);
    try {
      const res = await fetch("/api/data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirmText }),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error ?? "Delete failed.");
      setConfirmText("");
      setClearMsg(body.message ?? "Deleted.");
      await load();
    } catch (e) {
      setClearMsg(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Settings and Data"
        description="Imports, analysis configuration, integrations, service health, and data management. Secrets are never displayed here."
      />

      {loading ? (
        <Card><LoadingRows rows={6} /></Card>
      ) : error && !health ? (
        <Card><ErrorState message={error} onRetry={load} /></Card>
      ) : (
        <>
          <Card className="mb-4">
            <CardHeader title="Service health" sub="Connectivity only. No keys or values are shown." />
            <dl className="px-5 py-4 grid sm:grid-cols-2 gap-x-8 gap-y-2.5 text-sm">
              <div className="flex justify-between border-b border-line pb-2"><dt className="text-muted">Database</dt><dd className="font-medium">{health?.database === "connected" ? `Connected (${fmtInt(health.feedbackRows)} rows)` : "Unreachable"}</dd></div>
              <div className="flex justify-between border-b border-line pb-2"><dt className="text-muted">AI classifier (OpenAI)</dt><dd className="font-medium">{health?.openaiConfigured ? "Key configured" : "Not configured, rules fallback in use"}</dd></div>
              <div className="flex justify-between border-b border-line pb-2"><dt className="text-muted">Adaption</dt><dd className="font-medium">{health?.adaptionConfigured ? "Key configured" : "Not configured, local adapter in use"}</dd></div>
              <div className="flex justify-between border-b border-line pb-2"><dt className="text-muted">Server time</dt><dd className="font-medium tabular-nums">{health ? new Date(health.time).toLocaleString() : "n/a"}</dd></div>
            </dl>
          </Card>

          <Card className="mb-4" >
            <div id="adaption" className="scroll-mt-20">
              <CardHeader
                title="Adaption integration"
                sub="Adaptive Data preparation for the analysis pipeline."
                action={
                  <Button variant="outline" onClick={testAdaption} disabled={testing}>
                    <FlaskConical size={15} /> {testing ? "Testing…" : "Test live connection"}
                  </Button>
                }
              />
            </div>
            <div className="px-5 py-4 text-sm space-y-3">
              <p className="leading-relaxed">
                {health?.adaptionConfigured
                  ? "An Adaption API key is configured on the server. Preparation runs locally first; use the test button to verify the live service before relying on it."
                  : "No Adaption API key is configured, so InsightFlow uses the built-in local preparation adapter. It performs the documented Adaptive Data steps offline: column mapping, prompt deduplication, and quality evaluation. Status is always reported honestly as local-adapter."}
              </p>
              {testResult && (
                <p role="status" className={`rounded-md border px-3 py-2 ${testResult.ok ? "border-good/30 bg-good-wash text-good" : "border-warn/40 bg-warn-wash text-warn"}`}>
                  {testResult.message}
                </p>
              )}
              <div className="rounded-md border border-line bg-paper p-4">
                <h3 className="font-semibold mb-1.5">Setup guide</h3>
                <ol className="list-decimal pl-5 space-y-1 text-ink-soft">
                  <li>Sign in at adaptionlabs.ai/app and create an API key.</li>
                  <li>Set <code className="font-mono text-xs bg-surface border border-line rounded px-1">ADAPTION_API_KEY</code> in the server environment (see <code className="font-mono text-xs bg-surface border border-line rounded px-1">.env.example</code>).</li>
                  <li>Optionally set <code className="font-mono text-xs bg-surface border border-line rounded px-1">ADAPTION_BASE_URL</code> (default https://api.adaptionlabs.ai).</li>
                  <li>Restart the server and press “Test live connection” above.</li>
                  <li>Read the walkthrough: <a className="text-accent-deep underline underline-offset-4" href="https://docs.adaptionlabs.ai/tutorials/adaptive-data-app-walkthrough/" target="_blank" rel="noreferrer">Adaptive Data App Walkthrough</a>.</li>
                </ol>
                <p className="text-xs text-faint mt-2">Keys stay server-side in environment variables. They are never committed, never sent to the browser, and never logged.</p>
              </div>
            </div>
          </Card>

          <Card className="mb-4">
            <CardHeader title="Import history" sub="Every CSV and sample load, with duplicate and error counts." />
            {imports.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">No imports yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr><th scope="col">File</th><th scope="col">Rows</th><th scope="col">Imported</th><th scope="col">Duplicates</th><th scope="col">Errors</th><th scope="col">When</th></tr>
                  </thead>
                  <tbody>
                    {imports.map((imp) => (
                      <tr key={imp.id}>
                        <td className="font-medium">{imp.filename}</td>
                        <td className="tabular-nums">{fmtInt(imp.total_rows)}</td>
                        <td className="tabular-nums">{fmtInt(imp.imported_rows)}</td>
                        <td className="tabular-nums">{fmtInt(imp.duplicate_rows)}</td>
                        <td className="tabular-nums">{imp.error_rows}</td>
                        <td className="whitespace-nowrap text-muted">{timeAgo(imp.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Data management" sub="Destructive actions require typed confirmation." />
            <div className="px-5 py-4 text-sm space-y-3">
              <p className="text-ink-soft">
                Delete every stored record: feedback, imports, issues, analysis runs, and Adaption logs. The bundled
                official dataset is unaffected and can be reloaded afterwards.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <label className="sr-only" htmlFor="confirm">Type DELETE ALL DATA to confirm</label>
                <input
                  id="confirm"
                  className="w-full sm:max-w-xs px-3 py-2 text-sm bg-surface border border-line-strong rounded-md font-mono"
                  placeholder='Type DELETE ALL DATA'
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                />
                <Button variant="danger-outline" disabled={confirmText !== "DELETE ALL DATA" || clearing} onClick={clearData}>
                  <Trash2 size={15} /> {clearing ? "Deleting…" : "Delete all data"}
                </Button>
              </div>
              {clearMsg && <p role="status" className="text-sm">{clearMsg}</p>}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
