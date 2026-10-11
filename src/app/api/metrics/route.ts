export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDashboardMetrics } from "@/lib/metrics";

export async function GET() {
  try {
    return NextResponse.json(getDashboardMetrics());
  } catch (err) {
    console.error("GET /api/metrics failed:", err);
    return NextResponse.json({ error: "Could not compute metrics." }, { status: 500 });
  }
}
