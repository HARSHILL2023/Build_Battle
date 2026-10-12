import type { Request, Response } from "express";
import { Feedback } from "../models/Feedback.js";
import { Issue } from "../models/Issue.js";
import { toCsvCell } from "../utils/text.js";
import { getDashboardMetrics } from "../services/metricsService.js";
import { asyncHandler } from "../utils/errors.js";

/** CSV exports with spreadsheet formula-injection guards. */
export const getReport = asyncHandler(async (req: Request, res: Response) => {
  try {
    const type = typeof req.query.type === "string" ? req.query.type : "feedback";
    if (req.query.format !== "csv") {
      const metrics = await getDashboardMetrics();
      res.json({
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
      return;
    }

    let header: string[];
    let lines: string[];
    let filename: string;

    if (type === "issues") {
      const issues = (await Issue.find({}).sort({ priorityScore: -1 }).lean()) as Record<string, unknown>[];
      header = ["id", "title", "category", "primary_topic", "frequency_raw", "frequency_unique", "negative_count", "priority_score", "priority_band", "status", "recommendation"];
      const keyMap: Record<string, string> = { primary_topic: "primaryTopic", frequency_raw: "frequencyRaw", frequency_unique: "frequencyUnique", negative_count: "negativeCount", priority_score: "priorityScore", priority_band: "priorityBand" };
      lines = issues.map((r) =>
        header.map((h) => {
          const key = keyMap[h] ?? (h === "id" ? "sqliteId" : h);
          return toCsvCell(r[key] as string | number | null | undefined);
        }).join(",")
      );
      filename = "insightflow-issues.csv";
    } else {
      const rows = (await Feedback.find({})
        .sort({ sqliteId: 1 })
        .limit(20000)
        .select("sqliteId reviewText sourceCategory sentiment sentimentMethod topics analysisStatus source createdAt")
        .lean()) as Record<string, unknown>[];
      header = ["id", "review", "source_category", "sentiment", "sentiment_method", "topics", "analysis_status", "source", "created_at"];
      const keyMap: Record<string, string> = {
        id: "sqliteId",
        review: "reviewText",
        source_category: "sourceCategory",
        sentiment_method: "sentimentMethod",
        analysis_status: "analysisStatus",
      };
      lines = rows.map((r) =>
        header.map((h) => {
          const key = keyMap[h] ?? h;
          let value = r[key] as string | number | null | undefined;
          if (h === "topics") value = JSON.stringify((r[key] as string[]) ?? []);
          if (h === "created_at" && value) value = new Date(value as unknown as Date).toISOString();
          return toCsvCell(value);
        }).join(",")
      );
      filename = "insightflow-feedback.csv";
    }

    const csv = [header.join(","), ...lines].join("\r\n");
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error("GET /api/reports failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Could not generate report." });
  }
});
