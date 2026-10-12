import { Router } from "express";
import { deleteIssue, getIssue, listIssues, patchIssue } from "../controllers/issuesController.js";

export const issuesRouter = Router();

issuesRouter.get("/", listIssues);
issuesRouter.get("/:id", getIssue);
issuesRouter.patch("/:id", patchIssue);
issuesRouter.delete("/:id", deleteIssue);
