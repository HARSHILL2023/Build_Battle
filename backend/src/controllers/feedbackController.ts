import type { Request, Response } from "express";
import { z } from "zod";
import { Feedback } from "../models/Feedback.js";
import { ImportRecord } from "../models/ImportRecord.js";
import { ALLOWED_CATEGORIES, feedbackSchema } from "../utils/csv.js";
import { hashReview } from "../utils/text.js";
import { asyncHandler } from "../utils/errors.js";
import { feedbackRow } from "../utils/serialize.js";
import { reserveSeq } from "../utils/seq.js";

const querySchema = z.object({
  q: z.string().max(500).optional().default(""),
  category: z.string().optional().default(""),
  sentiment: z.string().optional().default(""),
  status: z.string().optional().default(""),
  topic: z.string().max(60).optional().default(""),
  hash: z.string().max(64).optional().default(""),
  ids: z.string().max(2000).optional().default(""),
  sort: z.enum(["newest", "oldest"]).optional().default("newest"),
  page: z.coerce.number().int().min(1).max(10000).optional().default(1),
  pageSize: z.coerce.number().int().min(5).max(100).optional().default(20),
});

const VALID_SENTIMENTS = ["positive", "neutral", "negative"];
const VALID_STATUS = ["pending", "analyzed", "failed"];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseId(id: unknown): number | null {
  if (typeof id !== "string") return null;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const listFeedback = asyncHandler(async (req: Request, res: Response) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query parameters." });
      return;
    }
    const { q, category, sentiment, status, topic, hash, ids, sort, page, pageSize } = parsed.data;

    // Whitelisted filters only; raw query values never reach Mongo.
    const filter: Record<string, unknown> = {};
    if (q) {
      filter.reviewText = { $regex: escapeRegExp(q.replace(/[%_]/g, "")), $options: "i" };
    }
    if (category && (ALLOWED_CATEGORIES as readonly string[]).includes(category)) {
      filter.sourceCategory = category;
    }
    if (sentiment && VALID_SENTIMENTS.includes(sentiment)) {
      filter.sentiment = sentiment;
    }
    if (status && VALID_STATUS.includes(status)) {
      filter.analysisStatus = status;
    }
    if (topic && /^[a-z0-9-]+$/.test(topic)) {
      filter.topics = topic;
    }
    if (hash) {
      filter.normHash = hash;
    }
    if (ids) {
      const idList = ids
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0)
        .slice(0, 50);
      if (idList.length > 0) filter.sqliteId = { $in: idList };
    }

    const sortSpec = sort === "oldest" ? { sqliteId: 1 as const } : { sqliteId: -1 as const };
    const total = await Feedback.countDocuments(filter);
    const docs = (await Feedback.find(filter).sort(sortSpec).skip((page - 1) * pageSize).limit(pageSize).lean()) as Record<string, unknown>[];

    const importObjectIds = [...new Set(docs.map((d) => d["importId"]).filter((v) => v != null))];
    const importSqliteById = new Map<string, number>();
    if (importObjectIds.length > 0) {
      const imports = (await ImportRecord.find({ _id: { $in: importObjectIds } }).select("sqliteId").lean()) as {
        _id: unknown;
        sqliteId: number;
      }[];
      for (const imp of imports) importSqliteById.set(String(imp._id), imp.sqliteId);
    }

    res.json({
      data: docs.map((d) =>
        feedbackRow({
          sqliteId: d["sqliteId"] as number,
          reviewText: d["reviewText"] as string,
          sourceCategory: d["sourceCategory"] as string,
          normHash: d["normHash"] as string,
          sentiment: (d["sentiment"] as string | null) ?? null,
          sentimentMethod: (d["sentimentMethod"] as string | null) ?? null,
          topics: (d["topics"] as string[]) ?? [],
          analysisStatus: d["analysisStatus"] as string,
          source: d["source"] as string,
          importSqliteId: d["importId"] != null ? importSqliteById.get(String(d["importId"])) ?? null : null,
          createdAt: d["createdAt"] as Date | undefined,
        })
      ),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    console.error("GET /api/feedback failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Could not load feedback." });
  }
});

export const createFeedbackBodySchema = feedbackSchema;

export const createFeedback = asyncHandler(async (req: Request, res: Response) => {
  try {
    const { review, category } = req.body as { review: string; category: string };
    const sqliteId = await reserveSeq("feedback", 1);
    await Feedback.create({
      reviewText: review,
      sourceCategory: category,
      normHash: hashReview(review, category),
      source: "manual",
      importId: null,
      sqliteId,
    });
    res.status(201).json({ id: sqliteId, message: "Feedback saved." });
  } catch (err) {
    console.error("POST /api/feedback failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Could not save feedback." });
  }
});

export const getFeedbackById = asyncHandler(async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid feedback id." });
    return;
  }
  const doc = (await Feedback.findOne({ sqliteId: id }).lean()) as Record<string, unknown> | null;
  if (!doc) {
    res.status(404).json({ error: "Feedback not found." });
    return;
  }
  res.json(
    feedbackRow({
      sqliteId: doc["sqliteId"] as number,
      reviewText: doc["reviewText"] as string,
      sourceCategory: doc["sourceCategory"] as string,
      normHash: doc["normHash"] as string,
      sentiment: (doc["sentiment"] as string | null) ?? null,
      sentimentMethod: (doc["sentimentMethod"] as string | null) ?? null,
      topics: (doc["topics"] as string[]) ?? [],
      analysisStatus: doc["analysisStatus"] as string,
      source: doc["source"] as string,
      importSqliteId: null,
      createdAt: doc["createdAt"] as Date | undefined,
    })
  );
});

export const deleteFeedbackById = asyncHandler(async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid feedback id." });
    return;
  }
  const result = await Feedback.deleteOne({ sqliteId: id });
  if (result.deletedCount === 0) {
    res.status(404).json({ error: "Feedback not found." });
    return;
  }
  res.json({ message: "Feedback deleted." });
});
