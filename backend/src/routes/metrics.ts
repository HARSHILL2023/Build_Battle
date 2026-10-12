import { Router } from "express";
import { getMetrics } from "../controllers/metricsController.js";

export const metricsRouter = Router();
metricsRouter.get("/", getMetrics);
