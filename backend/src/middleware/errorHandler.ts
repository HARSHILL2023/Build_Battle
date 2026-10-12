import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/errors.js";

// Consistent {error} JSON. Never leaks stacks or secrets in production.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const record = err as { type?: string; status?: unknown; code?: string; message?: string } | null;

  if (record?.type === "entity.parse.failed" || (err instanceof SyntaxError && "body" in (err as object))) {
    res.status(400).json({ error: "Request body must be valid JSON." });
    return;
  }
  if (record?.code === "LIMIT_FILE_SIZE") {
    res.status(400).json({ error: "File is too large. Maximum size is 8 MB." });
    return;
  }
  const status =
    err instanceof ApiError ? err.status : typeof record?.status === "number" ? record.status : 500;
  const message =
    err instanceof ApiError || (typeof status === "number" && status < 500)
      ? (err as Error).message || "Request failed."
      : "Internal server error.";
  if (status >= 500) {
    console.error("Request failed:", err instanceof Error ? err.message : String(err));
  }
  res.status(status).json({ error: message });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found." });
}
