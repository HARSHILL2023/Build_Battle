export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { createImport, getDb, insertFeedbackMany, listImports } from "@/lib/db";
import { parseFeedbackCsv } from "@/lib/csv";
import { checkRateLimit, clientKey, sweepBuckets } from "@/lib/rateLimit";

const CHUNK = 500;

function summarizeInsert(
  filename: string,
  valid: { review: string; category: string; hash: string }[],
  errors: { row: number; message: string }[],
  totalRows: number,
  source: string
) {
  const database = getDb();
  const existing = new Set(
    (database.prepare(`SELECT DISTINCT norm_hash AS h FROM feedback`).all() as { h: string }[]).map(
      (r) => r.h
    )
  );
  const seenInFile = new Set<string>();
  let duplicates = 0;
  for (const v of valid) {
    if (existing.has(v.hash) || seenInFile.has(v.hash)) duplicates += 1;
    seenInFile.add(v.hash);
    existing.add(v.hash);
  }
  // Preserve every record, including duplicates. Duplicate count is reported, not deleted.
  for (let i = 0; i < valid.length; i += CHUNK) {
    const chunk = valid.slice(i, i + CHUNK).map((v) => ({
      review_text: v.review,
      source_category: v.category,
      norm_hash: v.hash,
      source,
      import_id: null as number | null,
    }));
    const ids = insertFeedbackMany(chunk);
    void ids;
  }
  // Attach import id retroactively is unnecessary; record the import itself.
  const importId = createImport({
    filename,
    total_rows: totalRows,
    imported_rows: valid.length,
    duplicate_rows: duplicates,
    error_rows: errors.length,
    errors: JSON.stringify(errors.slice(0, 50)),
  });
  return {
    importId,
    filename,
    totalRows,
    importedRows: valid.length,
    duplicateRows: duplicates,
    errorRows: errors.length,
    errors: errors.slice(0, 20),
  };
}

export async function GET() {
  try {
    return NextResponse.json({ imports: listImports() });
  } catch (err) {
    console.error("GET /api/import failed:", err);
    return NextResponse.json({ error: "Could not load import history." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  sweepBuckets();
  const rl = checkRateLimit(`import:${clientKey(request)}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Imports are rate limited. Try again in ${rl.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }
  try {
    const contentType = request.headers.get("content-type") ?? "";

    // Sample loading from the bundled official dataset.
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { sample?: string };
      if (body.sample !== "official-500" && body.sample !== "official-full") {
        return NextResponse.json({ error: "Unknown sample. Use official-500 or official-full." }, { status: 400 });
      }
      const csvPath = path.join(process.cwd(), "public", "official-dataset.csv");
      if (!fs.existsSync(csvPath)) {
        return NextResponse.json({ error: "Bundled dataset not found on the server." }, { status: 500 });
      }
      const content = fs.readFileSync(csvPath, "utf8");
      // For the 500-row sample take every 14th data row for category balance.
      let useContent = content;
      if (body.sample === "official-500") {
        const lines = content.split("\n");
        const header = lines[0];
        const dataLines = lines.slice(1).filter((l) => l.trim());
        const sampled: string[] = [];
        const step = 14;
        for (let i = 0; i < dataLines.length && sampled.length < 500; i += step) {
          sampled.push(dataLines[i]);
        }
        useContent = [header, ...sampled].join("\n");
      }
      const parsed = parseFeedbackCsv(useContent, "official-dataset.csv");
      const summary = summarizeInsert(
        body.sample === "official-500" ? "official-dataset.csv (500-row sample)" : "official-dataset.csv (full)",
        parsed.valid,
        parsed.errors,
        parsed.totalRows,
        "sample"
      );
      return NextResponse.json(summary, { status: 201 });
    }

    // File upload.
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Upload a CSV file using multipart form data with a `file` field." },
        { status: 400 }
      );
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded. Attach a CSV file." }, { status: 400 });
    }
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      return NextResponse.json({ error: "Unsupported file format. Upload a .csv file." }, { status: 400 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "File is too large. Maximum size is 8 MB." }, { status: 400 });
    }
    const content = await file.text();
    const parsed = parseFeedbackCsv(content, file.name);
    if (parsed.valid.length === 0 && parsed.errors.length > 0) {
      return NextResponse.json(
        { error: parsed.errors[0].message, errors: parsed.errors.slice(0, 20) },
        { status: 400 }
      );
    }
    const summary = summarizeInsert(file.name, parsed.valid, parsed.errors, parsed.totalRows, "csv");
    return NextResponse.json(summary, { status: 201 });
  } catch (err) {
    console.error("POST /api/import failed:", err);
    return NextResponse.json({ error: "Import failed. Check the file and try again." }, { status: 500 });
  }
}
