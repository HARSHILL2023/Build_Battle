import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { Feedback } from "../src/models/Feedback";
import { Issue } from "../src/models/Issue";
import { migrateSqlite } from "../src/scripts/migrate-sqlite";
import { startTestApp, stopTestApp, type TestContext } from "./helpers";

let ctx: TestContext;
let sqlitePath: string;
let workdir: string;

function buildFixture(): string {
  workdir = mkdtempSync(join(tmpdir(), "if-migrate-"));
  sqlitePath = join(workdir, "source.db");
  const db = new Database(sqlitePath);
  db.exec(`
    CREATE TABLE feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, review_text TEXT NOT NULL, source_category TEXT NOT NULL, norm_hash TEXT NOT NULL, sentiment TEXT, sentiment_method TEXT, topics TEXT NOT NULL DEFAULT '[]', analysis_status TEXT NOT NULL DEFAULT 'pending', source TEXT NOT NULL DEFAULT 'manual', import_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE imports (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL, total_rows INTEGER NOT NULL DEFAULT 0, imported_rows INTEGER NOT NULL DEFAULT 0, duplicate_rows INTEGER NOT NULL DEFAULT 0, error_rows INTEGER NOT NULL DEFAULT 0, errors TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', primary_topic TEXT NOT NULL DEFAULT '', frequency_raw INTEGER NOT NULL DEFAULT 0, frequency_unique INTEGER NOT NULL DEFAULT 0, negative_count INTEGER NOT NULL DEFAULT 0, priority_score INTEGER NOT NULL DEFAULT 0, priority_band TEXT NOT NULL DEFAULT 'low', priority_explanation TEXT NOT NULL DEFAULT '', recommendation TEXT NOT NULL DEFAULT '', evidence_ids TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'open', auto_generated INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE analysis_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, method TEXT NOT NULL, total_unique INTEGER NOT NULL DEFAULT 0, succeeded INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, rows_updated INTEGER NOT NULL DEFAULT 0, detail TEXT NOT NULL DEFAULT '{}', started_at TEXT NOT NULL DEFAULT (datetime('now')), finished_at TEXT);
    CREATE TABLE adaption_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, operation TEXT NOT NULL, mode TEXT NOT NULL, input_rows INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'completed', summary TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  `);
  const imp = db.prepare(
    `INSERT INTO imports (filename, total_rows, imported_rows, duplicate_rows, error_rows, errors) VALUES (?, ?, ?, ?, ?, ?)`
  );
  imp.run("fixture.csv", 3, 3, 1, 0, "[]");
  const fb = db.prepare(
    `INSERT INTO feedback (review_text, source_category, norm_hash, sentiment, sentiment_method, topics, analysis_status, source, import_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  fb.run("Scam seller took my money", "Fraud and Scam", "hash-a", "negative", "deterministic:keyword-rules-v1", '["fraud-scam"]', "analyzed", "csv", 1);
  fb.run("Scam seller took my money", "Fraud and Scam", "hash-a", "negative", "deterministic:keyword-rules-v1", '["fraud-scam"]', "analyzed", "csv", 1);
  fb.run("Great support, resolved fast", "Customer Service", "hash-b", "positive", "deterministic:keyword-rules-v1", '["customer-support"]', "analyzed", "csv", 1);
  db.prepare(
    `INSERT INTO issues (title, description, category, primary_topic, frequency_raw, frequency_unique, negative_count, priority_score, priority_band, priority_explanation, recommendation, evidence_ids, status, auto_generated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run("Fraud and scams in Fraud and Scam", "d", "Fraud and Scam", "fraud-scam", 2, 1, 2, 85, "high", "e", "r", "[1,2]", "open", 1);
  db.prepare(`INSERT INTO analysis_runs (method, total_unique, succeeded, failed, rows_updated, detail) VALUES (?, ?, ?, ?, ?, ?)`)
    .run("deterministic:keyword-rules-v1", 2, 2, 0, 3, "{}");
  db.prepare(`INSERT INTO adaption_runs (operation, mode, input_rows, status, summary) VALUES (?, ?, ?, ?, ?)`)
    .run("prepare", "local-adapter", 3, "completed", "{}");
  db.close();
  return sqlitePath;
}

beforeAll(async () => {
  ctx = await startTestApp();
  buildFixture();
});

afterAll(async () => {
  await stopTestApp(ctx);
  rmSync(workdir, { recursive: true, force: true });
});

describe("migrateSqlite", () => {
  it("copies every table preserving ids", async () => {
    const summary = await migrateSqlite(sqlitePath);
    expect(summary.feedback.migrated).toBe(3);
    expect(summary.imports.migrated).toBe(1);
    expect(summary.issues.migrated).toBe(1);
    expect(summary.analysisRuns.migrated).toBe(1);
    expect(summary.adaptionRuns.migrated).toBe(1);
    expect(await Feedback.countDocuments()).toBe(3);
    const first = await Feedback.findOne({ sqliteId: 1 }).lean();
    expect(first).not.toBeNull();
  });

  it("is retry-safe: re-running never duplicates", async () => {
    await migrateSqlite(sqlitePath);
    await migrateSqlite(sqlitePath);
    expect(await Feedback.countDocuments()).toBe(3);
  });

  it("preserves live issue status across re-runs", async () => {
    await Issue.updateOne({ title: "Fraud and scams in Fraud and Scam" }, { $set: { status: "in_progress" } });
    await migrateSqlite(sqlitePath);
    const issue = await Issue.findOne({ title: "Fraud and scams in Fraud and Scam" }).lean();
    expect(issue?.status).toBe("in_progress");
  });
});
