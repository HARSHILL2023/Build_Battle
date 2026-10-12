import type { Request, Response } from "express";
import { Feedback } from "../models/Feedback.js";
import { ImportRecord } from "../models/ImportRecord.js";
import { Issue } from "../models/Issue.js";
import { AnalysisRun } from "../models/AnalysisRun.js";
import { AdaptionRun } from "../models/AdaptionRun.js";
import { asyncHandler } from "../utils/errors.js";

/** Danger zone: removes all stored workspace data. */
export const deleteAllData = asyncHandler(async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as { confirm?: string };
    if (body?.confirm !== "DELETE ALL DATA") {
      res.status(400).json({ error: "Confirmation required." });
      return;
    }
    await Promise.all([
      Feedback.deleteMany({}),
      ImportRecord.deleteMany({}),
      Issue.deleteMany({}),
      AnalysisRun.deleteMany({}),
      AdaptionRun.deleteMany({}),
    ]);
    res.json({ message: "All workspace data was deleted." });
  } catch (err) {
    console.error("DELETE /api/data failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Could not delete data." });
  }
});
