export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getDb, listAdaptionRuns, logAdaptionRun } from "@/lib/db";
import { getAdaptionConfig, testAdaptionConnection } from "@/lib/adaption/client";
import { evaluateQuality, prepareForAnalysis } from "@/lib/adaption/localAdapter";
import { checkRateLimit, clientKey, sweepBuckets } from "@/lib/rateLimit";

/**
 * Adaption integration status and operations.
 * GET: connection state (key presence only, never the key), current
 * data-quality evaluation, and run history.
 * POST {action}: evaluate | prepare | test.
 */
export async function GET() {
  try {
    const config = getAdaptionConfig();
    const database = getDb();
    const rows = database
      .prepare(`SELECT review_text, source_category, norm_hash FROM feedback`)
      .all() as { review_text: string; source_category: string; norm_hash: string }[];
    const quality = evaluateQuality(rows);
    return NextResponse.json({
      configured: config.configured,
      baseUrl: config.baseUrl,
      mode: config.configured ? "live-capable" : "local-adapter",
      rowCount: rows.length,
      quality,
      history: listAdaptionRuns(),
      docs: "https://docs.adaptionlabs.ai/tutorials/adaptive-data-app-walkthrough/",
    });
  } catch (err) {
    console.error("GET /api/adaption failed:", err);
    return NextResponse.json({ error: "Could not load Adaption status." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  sweepBuckets();
  const rl = checkRateLimit(`adaption:${clientKey(request)}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${rl.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }
  let body: { action?: string };
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  try {
    const database = getDb();
    const rows = database
      .prepare(`SELECT review_text, source_category, norm_hash FROM feedback`)
      .all() as { review_text: string; source_category: string; norm_hash: string }[];

    if (body.action === "test") {
      const result = await testAdaptionConnection();
      logAdaptionRun("test-connection", getAdaptionConfig().configured ? "live" : "local-adapter", 0, result.ok ? "completed" : "failed", {
        status: result.status,
        message: result.message,
      });
      return NextResponse.json(result);
    }

    if (body.action === "evaluate") {
      const quality = evaluateQuality(rows);
      logAdaptionRun("evaluate", "local-adapter", rows.length, "completed", {
        score: quality.score,
        grade: quality.grade,
        checks: quality.checks,
      });
      return NextResponse.json({ mode: "local-adapter", quality });
    }

    if (body.action === "prepare") {
      const prep = prepareForAnalysis(rows);
      const quality = evaluateQuality(rows);
      logAdaptionRun("prepare", "local-adapter", prep.rawRows, "completed", {
        uniquePatterns: prep.uniquePatterns,
        duplicateRows: prep.duplicateRows,
        qualityScore: quality.score,
        sample: prep.prepared.slice(0, 3).map((p) => ({
          context: p.context.slice(0, 120),
          sourceCategory: p.sourceCategory,
          rowCount: p.rowCount,
        })),
      });
      return NextResponse.json({
        mode: "local-adapter",
        rawRows: prep.rawRows,
        uniquePatterns: prep.uniquePatterns,
        duplicateRows: prep.duplicateRows,
        qualityScore: quality.score,
        sample: prep.prepared.slice(0, 5),
      });
    }

    return NextResponse.json({ error: "Unknown action. Use evaluate, prepare, or test." }, { status: 400 });
  } catch (err) {
    console.error("POST /api/adaption failed:", err);
    return NextResponse.json({ error: "Adaption operation failed." }, { status: 500 });
  }
}
