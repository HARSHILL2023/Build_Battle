import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "../config/db.js";
import { ensureSeqAtLeast } from "../utils/seq.js";
import { Feedback } from "../models/Feedback.js";
import { ImportRecord } from "../models/ImportRecord.js";
import { Issue } from "../models/Issue.js";
import { AnalysisRun } from "../models/AnalysisRun.js";
import { AdaptionRun } from "../models/AdaptionRun.js";

function parseJson<T>(value: string | null, fallback: T): T {
  if (value == null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function resolveSqlitePath(): string {
  const flagIdx = process.argv.indexOf("--sqlite");
  const fromFlag = flagIdx !== -1 ? process.argv[flagIdx + 1] : undefined;
  const resolved = fromFlag ?? process.env.INSIGHTFLOW_DB_PATH;
  if (!resolved) {
    throw new Error("No SQLite path. Pass --sqlite <path> or set INSIGHTFLOW_DB_PATH.");
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`SQLite file not found: ${resolved}`);
  }
  return path.resolve(resolved);
}

export interface MigrationSummary {
  feedback: { source: number; migrated: number };
  imports: { source: number; migrated: number };
  issues: { source: number; migrated: number };
  analysisRuns: { source: number; migrated: number };
  adaptionRuns: { source: number; migrated: number };
}

// Repeatable SQLite -> Mongo migration. Opens SQLite read-only and never
// modifies it. Upserts on sqliteId (issues: matched by title, status
// preserved) so retries never duplicate.
export async function migrateSqlite(sqlitePath: string): Promise<MigrationSummary> {
  const sqlite = new Database(sqlitePath, { readonly: true });
  try {
    const tableNames = new Set(
      (sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map(
        (r) => r.name
      )
    );
    const readAll = (table: string): Record<string, unknown>[] => {
      if (!tableNames.has(table)) {
        console.warn(`[migrate] table "${table}" missing in SQLite; skipping.`);
        return [];
      }
      return sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
    };

    const summary: MigrationSummary = {
      feedback: { source: 0, migrated: 0 },
      imports: { source: 0, migrated: 0 },
      issues: { source: 0, migrated: 0 },
      analysisRuns: { source: 0, migrated: 0 },
      adaptionRuns: { source: 0, migrated: 0 },
    };

    // Imports first so feedback import references resolve.
    const importRows = readAll("imports");
    summary.imports.source = importRows.length;
    const importObjectBySqliteId = new Map<number, mongoose.Types.ObjectId>();
    for (const r of importRows) {
      const sqliteId = r["id"] as number;
      const doc = await ImportRecord.findOneAndUpdate(
        { sqliteId },
        {
          $set: {
            filename: r["filename"],
            totalRows: r["total_rows"],
            importedRows: r["imported_rows"],
            duplicateRows: r["duplicate_rows"],
            errorRows: r["error_rows"],
            errors: parseJson<{ row: number; message: string }[]>(r["errors"] as string, []),
            createdAt: parseDate(r["created_at"] as string),
          },
          $setOnInsert: { sqliteId },
        },
        { upsert: true, returnDocument: "after" }
      );
      importObjectBySqliteId.set(sqliteId, doc._id as mongoose.Types.ObjectId);
      summary.imports.migrated += 1;
    }
    if (importRows.length > 0) {
      await ensureSeqAtLeast("importrecord", Math.max(...importRows.map((r) => r["id"] as number)));
    }

    const feedbackRows = readAll("feedback");
    summary.feedback.source = feedbackRows.length;
    for (const r of feedbackRows) {
      const sqliteId = r["id"] as number;
      const sqliteImportId = r["import_id"] as number | null;
      await Feedback.findOneAndUpdate(
        { sqliteId },
        {
          $set: {
            reviewText: r["review_text"],
            sourceCategory: r["source_category"],
            normHash: r["norm_hash"],
            sentiment: r["sentiment"],
            sentimentMethod: r["sentiment_method"],
            topics: parseJson<string[]>(r["topics"] as string, []),
            analysisStatus: r["analysis_status"],
            source: r["source"],
            importId:
              sqliteImportId != null ? importObjectBySqliteId.get(sqliteImportId) ?? null : null,
            createdAt: parseDate(r["created_at"] as string),
          },
          $setOnInsert: { sqliteId },
        },
        { upsert: true }
      );
      summary.feedback.migrated += 1;
    }
    if (feedbackRows.length > 0) {
      await ensureSeqAtLeast("feedback", Math.max(...feedbackRows.map((r) => r["id"] as number)));
    }

    const issueRows = readAll("issues");
    summary.issues.source = issueRows.length;
    for (const r of issueRows) {
      const title = r["title"] as string;
      const base = {
        description: r["description"],
        category: r["category"],
        primaryTopic: r["primary_topic"],
        frequencyRaw: r["frequency_raw"],
        frequencyUnique: r["frequency_unique"],
        negativeCount: r["negative_count"],
        priorityScore: r["priority_score"],
        priorityBand: r["priority_band"],
        priorityExplanation: r["priority_explanation"],
        recommendation: r["recommendation"],
        evidenceIds: parseJson<number[]>(r["evidence_ids"] as string, []),
        autoGenerated: (r["auto_generated"] as number) === 1,
        createdAt: parseDate(r["created_at"] as string),
        updatedAt: parseDate(r["updated_at"] as string),
      };
      const existing = await Issue.findOne({ title });
      if (existing) {
        // Retry-safe: refresh derived fields but keep the live status.
        await Issue.updateOne({ _id: existing._id }, { $set: base });
      } else {
        await Issue.create({ ...base, title, status: r["status"], sqliteId: r["id"] });
      }
      summary.issues.migrated += 1;
    }
    if (issueRows.length > 0) {
      await ensureSeqAtLeast("issue", Math.max(...issueRows.map((r) => r["id"] as number)));
    }

    const analysisRows = readAll("analysis_runs");
    summary.analysisRuns.source = analysisRows.length;
    for (const r of analysisRows) {
      await AnalysisRun.findOneAndUpdate(
        { sqliteId: r["id"] },
        {
          $set: {
            method: r["method"],
            totalUnique: r["total_unique"],
            succeeded: r["succeeded"],
            failed: r["failed"],
            rowsUpdated: r["rows_updated"],
            detail: parseJson(r["detail"] as string, {}),
            startedAt: parseDate(r["started_at"] as string),
            finishedAt: parseDate(r["finished_at"] as string),
          },
          $setOnInsert: { sqliteId: r["id"] },
        },
        { upsert: true }
      );
      summary.analysisRuns.migrated += 1;
    }
    if (analysisRows.length > 0) {
      await ensureSeqAtLeast("analysisrun", Math.max(...analysisRows.map((r) => r["id"] as number)));
    }

    const adaptionRows = readAll("adaption_runs");
    summary.adaptionRuns.source = adaptionRows.length;
    for (const r of adaptionRows) {
      await AdaptionRun.findOneAndUpdate(
        { sqliteId: r["id"] },
        {
          $set: {
            operation: r["operation"],
            mode: r["mode"],
            inputRows: r["input_rows"],
            status: r["status"],
            summary: parseJson(r["summary"] as string, {}),
            createdAt: parseDate(r["created_at"] as string),
          },
          $setOnInsert: { sqliteId: r["id"] },
        },
        { upsert: true }
      );
      summary.adaptionRuns.migrated += 1;
    }
    if (adaptionRows.length > 0) {
      await ensureSeqAtLeast("adaptionrun", Math.max(...adaptionRows.map((r) => r["id"] as number)));
    }

    // Validate 5 sample feedback records field-by-field.
    const sample = feedbackRows.slice(0, 5);
    let sampleOk = 0;
    for (const r of sample) {
      const doc = (await Feedback.findOne({ sqliteId: r["id"] }).lean()) as {
        reviewText: string;
        sourceCategory: string;
        sentiment: string | null;
        analysisStatus: string;
      } | null;
      const ok =
        doc != null &&
        doc.reviewText === r["review_text"] &&
        doc.sourceCategory === r["source_category"] &&
        (doc.sentiment ?? null) === (r["sentiment"] ?? null) &&
        doc.analysisStatus === r["analysis_status"];
      console.log(`[migrate] sample sqlite id ${r["id"] as number}: ${ok ? "OK" : "MISMATCH"}`);
      if (ok) sampleOk += 1;
    }

    const destCounts = {
      feedback: await Feedback.countDocuments(),
      imports: await ImportRecord.countDocuments(),
      issues: await Issue.countDocuments(),
      analysisRuns: await AnalysisRun.countDocuments(),
      adaptionRuns: await AdaptionRun.countDocuments(),
    };
    console.log(`[migrate] source counts: ${JSON.stringify({
      feedback: summary.feedback.source,
      imports: summary.imports.source,
      issues: summary.issues.source,
      analysisRuns: summary.analysisRuns.source,
      adaptionRuns: summary.adaptionRuns.source,
    })}`);
    console.log(`[migrate] destination counts: ${JSON.stringify(destCounts)}`);
    console.log(`[migrate] sample validation: ${sampleOk}/${sample.length} matched`);
    return summary;
  } finally {
    sqlite.close();
  }
}

const invokedAsMain =
  typeof process.argv[1] === "string" &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedAsMain) {
  (async () => {
    try {
      const sqlitePath = resolveSqlitePath();
      await connectDb();
      await migrateSqlite(sqlitePath);
      await disconnectDb();
      process.exit(0);
    } catch (err) {
      console.error("[migrate] failed:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  })();
}
