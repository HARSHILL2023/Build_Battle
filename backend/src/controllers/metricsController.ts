import type { Request, Response } from "express";
import { getDashboardMetrics } from "../services/metricsService.js";
import { asyncHandler } from "../utils/errors.js";

export const getMetrics = asyncHandler(async (_req: Request, res: Response) => {
  try {
    res.json(await getDashboardMetrics());
  } catch (err) {
    console.error("GET /api/metrics failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Could not compute metrics." });
  }
});
