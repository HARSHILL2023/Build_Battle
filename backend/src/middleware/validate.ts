import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";

export function validateBody<T>(schema: z.ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid request body." });
      return;
    }
    req.body = parsed.data;
    next();
  };
}

export function validateQuery<T>(schema: z.ZodType<T>, message = "Invalid query parameters.") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: message });
      return;
    }
    (req as Request & { validatedQuery: T }).validatedQuery = parsed.data;
    next();
  };
}

export function getQuery<T>(req: Request): T {
  return (req as Request & { validatedQuery: T }).validatedQuery;
}
