import type { Request, Response } from "express";
import { Feedback } from "../models/Feedback.js";
import { AdaptionRun } from "../models/AdaptionRun.js";
import { getAdaptionConfig, testAdaptionConnection } from "../services/adaption/client.js";
import { evaluateQuality, prepareForAnalysis } from "../services/adaption/localAdapter.js";
import { asyncHandler } from "../utils/errors.js";
import { adaptionRunRow } from "../utils/serialize.js";
import { reserveSeq } from "../utils/seq.js";

async function logRun(operation: string, mode: string, inputRows: number, status: string, summary: Record<string, unknown>): Promise<void> {
  await AdaptionRun.create({
    operation,
    mode,
    inputRows,
    status,
    summary,
    sqliteId: await reserveSeq("adaptionrun", 1),
  });
}

/**
 * Adaption integration status and operations.
 * GET: connection state (key presence only, never the key), current
 * data-quality evaluation, and run history.
 * POST {action}: evaluate | prepare | test.
 */
export const getAdaptionStatus = asyncHandler(async (_req: Request, res: Response) => {
  try {
    const config = getAdaptionConfig();
    const rows = (await Feedback.find({}).select("reviewText sourceCategory normHash").lean()) as {
      reviewText: string;
      sourceCategory: string;
      normHash: string;
    }[];
    const quality = evaluateQuality(
      rows.map((r) => ({ review_text: r.reviewText, source_category: r.sourceCategory }))
    );
    const historyDocs = (await AdaptionRun.find({}).sort({ sqliteId: -1 }).limit(20).lean()) as Record<string, unknown>[];
    res.json({
      configured: config.configured,
      baseUrl: config.baseUrl,
      mode: config.configured ? "live-capable" : "local-adapter",
      rowCount: rows.length,
      quality,
      history: historyDocs.map((d) =>
        adaptionRunRow({
          sqliteId: d["sqliteId"] as number,
          operation: d["operation"] as string,
          mode: d["mode"] as string,
          inputRows: d["inputRows"] as number,
          status: d["status"] as string,
          summary: d["summary"],
          createdAt: d["createdAt"] as Date | undefined,
        })
      ),
      docs: "https://docs.adaptionlabs.ai/tutorials/adaptive-data-app-walkthrough/",
    });
  } catch (err) {
    console.error("GET /api/adaption failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Could not load Adaption status." });
  }
});

export const postAdaption = asyncHandler(async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { action?: string };
  try {
    const rows = (await Feedback.find({}).select("reviewText sourceCategory normHash").lean()) as {
      reviewText: string;
      sourceCategory: string;
      normHash: string;
    }[];
    const mapped = rows.map((r) => ({
      review_text: r.reviewText,
      source_category: r.sourceCategory,
      norm_hash: r.normHash,
    }));

    if (body.action === "test") {
      const result = await testAdaptionConnection();
      await logRun("test-connection", getAdaptionConfig().configured ? "live" : "local-adapter", 0, result.ok ? "completed" : "failed", {
        status: result.status,
        message: result.message,
      });
      res.json(result);
      return;
    }

    if (body.action === "evaluate") {
      const quality = evaluateQuality(mapped);
      await logRun("evaluate", "local-adapter", rows.length, "completed", {
        score: quality.score,
        grade: quality.grade,
        checks: quality.checks,
      });
      res.json({ mode: "local-adapter", quality });
      return;
    }

    if (body.action === "prepare") {
      const prep = prepareForAnalysis(mapped);
      const quality = evaluateQuality(mapped);
      await logRun("prepare", "local-adapter", prep.rawRows, "completed", {
        uniquePatterns: prep.uniquePatterns,
        duplicateRows: prep.duplicateRows,
        qualityScore: quality.score,
        sample: prep.prepared.slice(0, 3).map((p) => ({
          context: p.context.slice(0, 120),
          sourceCategory: p.sourceCategory,
          rowCount: p.rowCount,
        })),
      });
      res.json({
        mode: "local-adapter",
        rawRows: prep.rawRows,
        uniquePatterns: prep.uniquePatterns,
        duplicateRows: prep.duplicateRows,
        qualityScore: quality.score,
        sample: prep.prepared.slice(0, 5),
      });
      return;
    }

    res.status(400).json({ error: "Unknown action. Use evaluate, prepare, or test." });
  } catch (err) {
    console.error("POST /api/adaption failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Adaption operation failed." });
  }
});
