import { Router } from "express";
import { deleteAllData } from "../controllers/dataController.js";
import { rateLimitRoute } from "../utils/rateLimit.js";

export const dataRouter = Router();

dataRouter.delete(
  "/",
  rateLimitRoute("data-delete", 5, (s) => `Too many requests. Try again in ${s}s.`),
  deleteAllData
);
