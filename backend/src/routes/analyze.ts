import { Router } from "express";
import { listAnalysisRuns, postAnalyze } from "../controllers/analyzeController.js";
import { rateLimitRoute } from "../utils/rateLimit.js";

export const analyzeRouter = Router();

analyzeRouter.get("/", listAnalysisRuns);
analyzeRouter.post(
  "/",
  rateLimitRoute("analyze", 5, (s) => `Analysis is rate limited. Try again in ${s}s.`),
  postAnalyze
);
