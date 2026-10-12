import { Router } from "express";
import { getReport } from "../controllers/reportsController.js";

export const reportsRouter = Router();
reportsRouter.get("/", getReport);
