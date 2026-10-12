import { Router } from "express";
import { getAdaptionStatus, postAdaption } from "../controllers/adaptionController.js";
import { rateLimitRoute } from "../utils/rateLimit.js";

export const adaptionRouter = Router();

adaptionRouter.get("/", getAdaptionStatus);
adaptionRouter.post(
  "/",
  rateLimitRoute("adaption", 10, (s) => `Too many requests. Try again in ${s}s.`),
  postAdaption
);
