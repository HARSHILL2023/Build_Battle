export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { countFeedback, getDb } from "@/lib/db";
import { isOpenAIConfigured } from "@/lib/ai/openaiProvider";
import { getAdaptionConfig } from "@/lib/adaption/client";

export async function GET() {
  try {
    const database = getDb();
    database.prepare(`SELECT 1`).get();
    return NextResponse.json({
      ok: true,
      database: "connected",
      feedbackRows: countFeedback(),
      openaiConfigured: isOpenAIConfigured(),
      adaptionConfigured: getAdaptionConfig().configured,
      time: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Health check failed:", err);
    return NextResponse.json({ ok: false, database: "unreachable" }, { status: 500 });
  }
}
