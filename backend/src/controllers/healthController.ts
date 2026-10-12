import type { Request, Response } from "express";
import { dbReadyState } from "../config/db.js";
import { Feedback } from "../models/Feedback.js";
import { isOpenAIConfigured } from "../services/openaiProvider.js";
import { getAdaptionConfig } from "../services/adaption/client.js";
import { asyncHandler } from "../utils/errors.js";

export const getHealth = asyncHandler(async (_req: Request, res: Response) => {
  try {
    if (dbReadyState() !== 1) throw new Error("database not connected");
    const feedbackRows = await Feedback.countDocuments();
    res.json({
      ok: true,
      database: "connected",
      feedbackRows,
      openaiConfigured: isOpenAIConfigured(),
      adaptionConfigured: getAdaptionConfig().configured,
      time: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Health check failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ ok: false, database: "unreachable" });
  }
});
