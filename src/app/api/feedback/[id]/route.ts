export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { deleteFeedbackById, getFeedbackById } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid feedback id." }, { status: 400 });
  }
  const row = getFeedbackById(id);
  if (!row) return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid feedback id." }, { status: 400 });
  }
  const ok = deleteFeedbackById(id);
  if (!ok) return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
  return NextResponse.json({ message: "Feedback deleted." });
}
