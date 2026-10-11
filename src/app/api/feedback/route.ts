export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { countFeedback, getDb, insertFeedbackMany } from "@/lib/db";
import { ALLOWED_CATEGORIES, feedbackSchema } from "@/lib/csv";
import { hashReview } from "@/lib/text";
import { checkRateLimit, clientKey, sweepBuckets } from "@/lib/rateLimit";

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

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = querySchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters." }, { status: 400 });
    }
    const { q, category, sentiment, status, topic, hash, ids, sort, page, pageSize } = parsed.data;
    const database = getDb();

    const where: string[] = [];
    const args: (string | number)[] = [];
    if (q) {
      where.push(`review_text LIKE ?`);
      args.push(`%${q.replace(/[%_]/g, "")}%`);
    }
    if (category && (ALLOWED_CATEGORIES as readonly string[]).includes(category)) {
      where.push(`source_category = ?`);
      args.push(category);
    }
    if (sentiment && VALID_SENTIMENTS.includes(sentiment)) {
      where.push(`sentiment = ?`);
      args.push(sentiment);
    }
    if (status && VALID_STATUS.includes(status)) {
      where.push(`analysis_status = ?`);
      args.push(status);
    }
    if (topic && /^[a-z0-9-]+$/.test(topic)) {
      where.push(`topics LIKE ?`);
      args.push(`%"${topic}"%`);
    }
    if (hash) {
      where.push(`norm_hash = ?`);
      args.push(hash);
    }
    if (ids) {
      const idList = ids
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0)
        .slice(0, 50);
      if (idList.length > 0) {
        where.push(`id IN (${idList.map(() => "?").join(",")})`);
        args.push(...idList);
      }
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const orderSql = sort === "oldest" ? "ORDER BY id ASC" : "ORDER BY id DESC";

    const total = (
      database.prepare(`SELECT COUNT(*) AS n FROM feedback ${whereSql}`).get(...args) as { n: number }
    ).n;
    const data = database
      .prepare(`SELECT * FROM feedback ${whereSql} ${orderSql} LIMIT ? OFFSET ?`)
      .all(...args, pageSize, (page - 1) * pageSize);

    return NextResponse.json({
      data,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    console.error("GET /api/feedback failed:", err);
    return NextResponse.json({ error: "Could not load feedback." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  sweepBuckets();
  const rl = checkRateLimit(`feedback:${clientKey(request)}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Submissions are rate limited. Try again in ${rl.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  try {
    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid feedback." },
        { status: 400 }
      );
    }
    const { review, category } = parsed.data;
    const ids = insertFeedbackMany([
      {
        review_text: review,
        source_category: category,
        norm_hash: hashReview(review, category),
        source: "manual",
        import_id: null,
      },
    ]);
    void countFeedback;
    return NextResponse.json({ id: ids[0], message: "Feedback saved." }, { status: 201 });
  } catch (err) {
    console.error("POST /api/feedback failed:", err);
    return NextResponse.json({ error: "Could not save feedback." }, { status: 500 });
  }
}
