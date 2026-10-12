import type { Request, Response } from "express";
import { AnalysisRun } from "../models/AnalysisRun.js";
import { runAnalysisPipeline, type AnalysisMethod } from "../services/analysisService.js";
import { asyncHandler } from "../utils/errors.js";
import { analysisRunRow } from "../utils/serialize.js";

export const listAnalysisRuns = asyncHandler(async (_req: Request, res: Response) => {
  try {
    const docs = (await AnalysisRun.find({}).sort({ sqliteId: -1 }).limit(20).lean()) as Record<string, unknown>[];
    res.json({
      runs: docs.map((d) =>
        analysisRunRow({
          sqliteId: d["sqliteId"] as number,
          method: d["method"] as string,
          totalUnique: d["totalUnique"] as number,
          succeeded: d["succeeded"] as number,
          failed: d["failed"] as number,
          rowsUpdated: d["rowsUpdated"] as number,
          detail: d["detail"],
          startedAt: d["startedAt"] as Date | undefined,
          finishedAt: (d["finishedAt"] as Date | null) ?? null,
        })
      ),
    });
  } catch (err) {
    console.error("GET /api/analyze failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Could not load analysis history." });
  }
});

export const postAnalyze = asyncHandler(async (req: Request, res: Response) => {
  try {
    let method: AnalysisMethod = "auto";
    let onlyPending = false;
    const body = (req.body ?? {}) as { method?: string; onlyPending?: boolean };
    if (body.method === "openai" || body.method === "deterministic" || body.method === "auto") {
      method = body.method;
    }
    onlyPending = body.onlyPending === true;
    const summary = await runAnalysisPipeline(method, onlyPending);
    res.json(summary);
  } catch (err) {
    console.error("POST /api/analyze failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Analysis failed. Check service status in Settings and try again." });
  }
});
