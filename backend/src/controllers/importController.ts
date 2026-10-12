import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { Feedback } from "../models/Feedback.js";
import { ImportRecord } from "../models/ImportRecord.js";
import { parseFeedbackCsv } from "../utils/csv.js";
import { asyncHandler } from "../utils/errors.js";
import { importRow } from "../utils/serialize.js";
import { reserveSeq } from "../utils/seq.js";
import { invalidateMetrics } from "../services/metricsService.js";

const CHUNK = 500;

async function summarizeInsert(
  filename: string,
  valid: { review: string; category: string; hash: string }[],
  errors: { row: number; message: string }[],
  totalRows: number,
  source: string
) {
  const existing = new Set<string>(await Feedback.distinct("normHash"));
  const seenInFile = new Set<string>();
  let duplicates = 0;
  for (const v of valid) {
    if (existing.has(v.hash) || seenInFile.has(v.hash)) duplicates += 1;
    seenInFile.add(v.hash);
    existing.add(v.hash);
  }
  // Preserve every record, including duplicates. Duplicate count is reported, not deleted.
  if (valid.length > 0) {
    const firstId = await reserveSeq("feedback", valid.length);
    for (let i = 0; i < valid.length; i += CHUNK) {
      const chunk = valid.slice(i, i + CHUNK).map((v, j) => ({
        reviewText: v.review,
        sourceCategory: v.category,
        normHash: v.hash,
        source,
        importId: null,
        sqliteId: firstId + i + j,
      }));
      await Feedback.insertMany(chunk);
    }
  }
  const importSqliteId = await reserveSeq("importrecord", 1);
  await ImportRecord.create({
    filename,
    totalRows,
    importedRows: valid.length,
    duplicateRows: duplicates,
    errorRows: errors.length,
    errors: errors.slice(0, 50),
    sqliteId: importSqliteId,
  });
  invalidateMetrics();
  return {
    importId: importSqliteId,
    filename,
    totalRows,
    importedRows: valid.length,
    duplicateRows: duplicates,
    errorRows: errors.length,
    errors: errors.slice(0, 20),
  };
}

function resolveSeedPath(): string | null {
  const candidates = [
    path.join(process.cwd(), "data-seed", "official-dataset.csv"),
    path.join(process.cwd(), "..", "public", "official-dataset.csv"),
    path.join(process.cwd(), "public", "official-dataset.csv"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export const listImports = asyncHandler(async (_req: Request, res: Response) => {
  try {
    const docs = (await ImportRecord.find({}).sort({ sqliteId: -1 }).limit(50).lean()) as Record<string, unknown>[];
    res.json({
      imports: docs.map((d) =>
        importRow({
          sqliteId: d["sqliteId"] as number,
          filename: d["filename"] as string,
          totalRows: d["totalRows"] as number,
          importedRows: d["importedRows"] as number,
          duplicateRows: d["duplicateRows"] as number,
          errorRows: d["errorRows"] as number,
          errors: (d["errors"] as { row: number; message: string }[]) ?? [],
          createdAt: d["createdAt"] as Date | undefined,
        })
      ),
    });
  } catch (err) {
    console.error("GET /api/import failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Could not load import history." });
  }
});

export const postImport = asyncHandler(async (req: Request, res: Response) => {
  try {
    const contentType = req.headers["content-type"] ?? "";

    // Sample loading from the bundled official dataset.
    if (typeof contentType === "string" && contentType.includes("application/json")) {
      const body = (req.body ?? {}) as { sample?: string };
      if (body.sample !== "official-500" && body.sample !== "official-full") {
        res.status(400).json({ error: "Unknown sample. Use official-500 or official-full." });
        return;
      }
      const csvPath = resolveSeedPath();
      if (!csvPath) {
        res.status(500).json({ error: "Bundled dataset not found on the server." });
        return;
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
      const summary = await summarizeInsert(
        body.sample === "official-500" ? "official-dataset.csv (500-row sample)" : "official-dataset.csv (full)",
        parsed.valid,
        parsed.errors,
        parsed.totalRows,
        "sample"
      );
      res.status(201).json(summary);
      return;
    }

    // File upload (multer memory storage populates req.file).
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded. Attach a CSV file." });
      return;
    }
    if (!/\.csv$/i.test(file.originalname) && file.mimetype !== "text/csv") {
      res.status(400).json({ error: "Unsupported file format. Upload a .csv file." });
      return;
    }
    const content = file.buffer.toString("utf8");
    const parsed = parseFeedbackCsv(content, file.originalname);
    if (parsed.valid.length === 0 && parsed.errors.length > 0) {
      res.status(400).json({ error: parsed.errors[0].message, errors: parsed.errors.slice(0, 20) });
      return;
    }
    const summary = await summarizeInsert(file.originalname, parsed.valid, parsed.errors, parsed.totalRows, "csv");
    res.status(201).json(summary);
  } catch (err) {
    console.error("POST /api/import failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Import failed. Check the file and try again." });
  }
});
