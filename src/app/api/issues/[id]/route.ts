export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getDb, getIssueById, updateIssueStatus } from "@/lib/db";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid issue id." }, { status: 400 });
    }
    const issue = getIssueById(id);
    if (!issue) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
    let evidenceIds: number[] = [];
    try {
      evidenceIds = JSON.parse(issue.evidence_ids) as number[];
    } catch {
      evidenceIds = [];
    }
    let evidence: unknown[] = [];
    if (evidenceIds.length > 0) {
      const database = getDb();
      evidence = database
        .prepare(
          `SELECT id, review_text, source_category, sentiment FROM feedback WHERE id IN (${evidenceIds.map(() => "?").join(",")})`
        )
        .all(...evidenceIds);
    }
    return NextResponse.json({ issue, evidence });
  } catch (err) {
    console.error("GET /api/issues/[id] failed:", err);
    return NextResponse.json({ error: "Could not load issue." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid issue id." }, { status: 400 });
    }
    const database = getDb();
    const changes = database.prepare(`DELETE FROM issues WHERE id = ? AND auto_generated = 0`).run(id).changes;
    if (changes === 0) {
      return NextResponse.json(
        { error: "Issue not found, or it is auto-generated and managed by analysis." },
        { status: 404 }
      );
    }
    return NextResponse.json({ message: "Issue deleted." });
  } catch (err) {
    console.error("DELETE /api/issues/[id] failed:", err);
    return NextResponse.json({ error: "Could not delete issue." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid issue id." }, { status: 400 });
    }
    let body: { status?: string };
    try {
      body = (await request.json()) as { status?: string };
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    if (!body.status || !["open", "in_progress", "resolved"].includes(body.status)) {
      return NextResponse.json({ error: "Status must be open, in_progress, or resolved." }, { status: 400 });
    }
    const ok = updateIssueStatus(id, body.status);
    if (!ok) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
    return NextResponse.json({ issue: getIssueById(id) });
  } catch (err) {
    console.error("PATCH /api/issues failed:", err);
    return NextResponse.json({ error: "Could not update issue." }, { status: 500 });
  }
}
