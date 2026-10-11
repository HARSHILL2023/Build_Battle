export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { listIssues } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get("status") ?? "";
    return NextResponse.json({ issues: listIssues(status || undefined) });
  } catch (err) {
    console.error("GET /api/issues failed:", err);
    return NextResponse.json({ error: "Could not load issues." }, { status: 500 });
  }
}
