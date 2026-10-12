import { Router } from "express";
import multer from "multer";
import { listImports, postImport } from "../controllers/importController.js";
import { rateLimitRoute } from "../utils/rateLimit.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

export const importRouter = Router();

importRouter.get("/", listImports);
importRouter.post(
  "/",
  rateLimitRoute("import", 10, (s) => `Imports are rate limited. Try again in ${s}s.`),
  upload.single("file"),
  postImport
);
