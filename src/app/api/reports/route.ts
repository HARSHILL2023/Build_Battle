export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { toCsvCell } from "@/lib/text";
import { getDashboardMetrics } from "@/lib/metrics";

/**
 * CSV exports with spreadsheet formula-injection guards.
 * GET /api/reports?format=csv&type=feedback|issues
 */
export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get("type") ?? "feedback";
    if (request.nextUrl.searchParams.get("format") !== "csv") {
      const metrics = getDashboardMetrics();
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        coverage: {
          totalRecords: metrics.totalRecords,
          uniquePatterns: metrics.uniquePatterns,
          duplicateRecords: metrics.duplicateRecords,
          imports: metrics.imports,
        },
        sentiment: metrics.sentiment,
        byCategory: metrics.byCategory,
        byTopic: metrics.byTopic,
        quality: metrics.quality,
        limitations: [
          "Source dataset has no sentiment labels; sentiment is analyzed, not observed.",
          "Source dataset has no review timestamps; no time-series trends are shown.",
          "Source categories are preserved as-is and are not verified AI classifications.",
          "No customer names, IDs, ratings, dates, or locations are stored or shown.",
        ],
      });
    }

    const database = getDb();
    let header: string[];
    let lines: string[];
    let filename: string;

    if (type === "issues") {
      const issues = database
        .prepare(`SELECT * FROM issues ORDER BY priority_score DESC`)
        .all() as Record<string, string | number>[];
      header = ["id", "title", "category", "primary_topic", "frequency_raw", "frequency_unique", "negative_count", "priority_score", "priority_band", "status", "recommendation"];
      lines = issues.map((r) => header.map((h) => toCsvCell(r[h])).join(","));
      filename = "insightflow-issues.csv";
    } else {
      const rows = database
        .prepare(
          `SELECT id, review_text, source_category, sentiment, sentiment_method, topics, analysis_status, source, created_at FROM feedback ORDER BY id ASC LIMIT 20000`
        )
        .all() as Record<string, string | number | null>[];
      header = ["id", "review", "source_category", "sentiment", "sentiment_method", "topics", "analysis_status", "source", "created_at"];
      const keyMap: Record<string, string> = {
        review: "review_text",
      };
      lines = rows.map((r) =>
        header.map((h) => toCsvCell(r[keyMap[h] ?? h])).join(",")
      );
      filename = "insightflow-feedback.csv";
    }

    const csv = [header.join(","), ...lines].join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("GET /api/reports failed:", err);
    return NextResponse.json({ error: "Could not generate report." }, { status: 500 });
  }
}
