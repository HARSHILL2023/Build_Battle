export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { listAnalysisRuns } from "@/lib/db";
import { runAnalysisPipeline, type AnalysisMethod } from "@/lib/ai/pipeline";
import { checkRateLimit, clientKey, sweepBuckets } from "@/lib/rateLimit";

export async function GET() {
  try {
    return NextResponse.json({ runs: listAnalysisRuns() });
  } catch (err) {
    console.error("GET /api/analyze failed:", err);
    return NextResponse.json({ error: "Could not load analysis history." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  sweepBuckets();
  const rl = checkRateLimit(`analyze:${clientKey(request)}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Analysis is rate limited. Try again in ${rl.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }
  try {
    let method: AnalysisMethod = "auto";
    let onlyPending = false;
    try {
      const body = (await request.json()) as { method?: string; onlyPending?: boolean };
      if (body.method === "openai" || body.method === "deterministic" || body.method === "auto") {
        method = body.method;
      }
      onlyPending = body.onlyPending === true;
    } catch {
      // Empty body: use defaults.
    }
    const summary = await runAnalysisPipeline(method, onlyPending);
    return NextResponse.json(summary);
  } catch (err) {
    console.error("POST /api/analyze failed:", err);
    return NextResponse.json(
      { error: "Analysis failed. Check service status in Settings and try again." },
      { status: 500 }
    );
  }
}
