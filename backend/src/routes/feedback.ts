import { Router } from "express";
import {
  createFeedback,
  createFeedbackBodySchema,
  deleteFeedbackById,
  getFeedbackById,
  listFeedback,
} from "../controllers/feedbackController.js";
import { validateBody } from "../middleware/validate.js";
import { rateLimitRoute } from "../utils/rateLimit.js";

export const feedbackRouter = Router();

feedbackRouter.get("/", listFeedback);
feedbackRouter.post(
  "/",
  rateLimitRoute("feedback", 30, (s) => `Submissions are rate limited. Try again in ${s}s.`),
  validateBody(createFeedbackBodySchema),
  createFeedback
);
feedbackRouter.get("/:id", getFeedbackById);
feedbackRouter.delete("/:id", deleteFeedbackById);
