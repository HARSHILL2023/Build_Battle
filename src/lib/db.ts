import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export interface FeedbackRow {
  id: number;
  review_text: string;
  source_category: string;
  norm_hash: string;
  sentiment: string | null;
  sentiment_method: string | null;
  topics: string; // JSON array
  analysis_status: string;
  source: string;
  import_id: number | null;
  created_at: string;
}

export interface ImportRecord {
  id: number;
  filename: string;
  total_rows: number;
  imported_rows: number;
  duplicate_rows: number;
  error_rows: number;
  errors: string; // JSON array of {row, message}
  created_at: string;
}

export interface IssueRow {
  id: number;
  title: string;
  description: string;
  category: string;
  primary_topic: string;
  frequency_raw: number;
  frequency_unique: number;
  negative_count: number;
  priority_score: number;
  priority_band: string;
  priority_explanation: string;
  recommendation: string;
  evidence_ids: string; // JSON array of feedback ids
  status: string; // open | in_progress | resolved
  auto_generated: number;
  created_at: string;
  updated_at: string;
}

let db: Database.Database | null = null;

export function getDbPath(): string {
  if (process.env.INSIGHTFLOW_DB_PATH) return process.env.INSIGHTFLOW_DB_PATH;
  return path.join(process.cwd(), "data", "insightflow.db");
}

export function getDb(): Database.Database {
  if (db) return db;
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      review_text TEXT NOT NULL,
      source_category TEXT NOT NULL,
      norm_hash TEXT NOT NULL,
      sentiment TEXT,
      sentiment_method TEXT,
      topics TEXT NOT NULL DEFAULT '[]',
      analysis_status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'manual',
      import_id INTEGER REFERENCES imports(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_hash ON feedback(norm_hash);
    CREATE INDEX IF NOT EXISTS idx_feedback_sentiment ON feedback(sentiment);
    CREATE INDEX IF NOT EXISTS idx_feedback_category ON feedback(source_category);
    CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(analysis_status);

    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      total_rows INTEGER NOT NULL DEFAULT 0,
      imported_rows INTEGER NOT NULL DEFAULT 0,
      duplicate_rows INTEGER NOT NULL DEFAULT 0,
      error_rows INTEGER NOT NULL DEFAULT 0,
      errors TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      primary_topic TEXT NOT NULL DEFAULT '',
      frequency_raw INTEGER NOT NULL DEFAULT 0,
      frequency_unique INTEGER NOT NULL DEFAULT 0,
      negative_count INTEGER NOT NULL DEFAULT 0,
      priority_score INTEGER NOT NULL DEFAULT 0,
      priority_band TEXT NOT NULL DEFAULT 'low',
      priority_explanation TEXT NOT NULL DEFAULT '',
      recommendation TEXT NOT NULL DEFAULT '',
      evidence_ids TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'open',
      auto_generated INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS analysis_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      method TEXT NOT NULL,
      total_unique INTEGER NOT NULL DEFAULT 0,
      succeeded INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      rows_updated INTEGER NOT NULL DEFAULT 0,
      detail TEXT NOT NULL DEFAULT '{}',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS adaption_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,
      mode TEXT NOT NULL,
      input_rows INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed',
      summary TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// ---------- feedback ----------

export interface FeedbackInsert {
  review_text: string;
  source_category: string;
  norm_hash: string;
  source: string;
  import_id: number | null;
}

export function insertFeedbackMany(rows: FeedbackInsert[]): number[] {
  const database = getDb();
  const stmt = database.prepare(
    `INSERT INTO feedback (review_text, source_category, norm_hash, source, import_id)
     VALUES (@review_text, @source_category, @norm_hash, @source, @import_id)`
  );
  const ids: number[] = [];
  const tx = database.transaction((items: FeedbackInsert[]) => {
    for (const item of items) {
      const info = stmt.run(item);
      ids.push(Number(info.lastInsertRowid));
    }
  });
  tx(rows);
  return ids;
}

export function updateAnalysisByHash(
  hash: string,
  sentiment: string,
  method: string,
  topics: string[]
): number {
  const database = getDb();
  const info = database
    .prepare(
      `UPDATE feedback SET sentiment = ?, sentiment_method = ?, topics = ?, analysis_status = 'analyzed'
       WHERE norm_hash = ?`
    )
    .run(sentiment, method, JSON.stringify(topics), hash);
  return info.changes;
}

export function markAnalysisFailed(hash: string): void {
  getDb()
    .prepare(`UPDATE feedback SET analysis_status = 'failed' WHERE norm_hash = ?`)
    .run(hash);
}

export function countFeedback(): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM feedback`).get() as { n: number }).n;
}

export function getFeedbackById(id: number): FeedbackRow | undefined {
  return getDb().prepare(`SELECT * FROM feedback WHERE id = ?`).get(id) as
    | FeedbackRow
    | undefined;
}

export function deleteFeedbackById(id: number): boolean {
  return getDb().prepare(`DELETE FROM feedback WHERE id = ?`).run(id).changes > 0;
}

export function clearAllData(): void {
  const database = getDb();
  const tx = database.transaction(() => {
    database.exec(
      `DELETE FROM feedback; DELETE FROM imports; DELETE FROM issues; DELETE FROM analysis_runs; DELETE FROM adaption_runs;`
    );
  });
  tx();
}

// ---------- imports ----------

export function createImport(rec: Omit<ImportRecord, "id" | "created_at">): number {
  const info = getDb()
    .prepare(
      `INSERT INTO imports (filename, total_rows, imported_rows, duplicate_rows, error_rows, errors)
       VALUES (@filename, @total_rows, @imported_rows, @duplicate_rows, @error_rows, @errors)`
    )
    .run(rec);
  return Number(info.lastInsertRowid);
}

export function listImports(limit = 50): ImportRecord[] {
  return getDb()
    .prepare(`SELECT * FROM imports ORDER BY id DESC LIMIT ?`)
    .all(limit) as ImportRecord[];
}

// ---------- analysis runs ----------

export function createAnalysisRun(method: string, totalUnique: number): number {
  const info = getDb()
    .prepare(`INSERT INTO analysis_runs (method, total_unique) VALUES (?, ?)`)
    .run(method, totalUnique);
  return Number(info.lastInsertRowid);
}

export function finishAnalysisRun(
  id: number,
  succeeded: number,
  failed: number,
  rowsUpdated: number,
  detail: Record<string, unknown>
): void {
  getDb()
    .prepare(
      `UPDATE analysis_runs SET succeeded = ?, failed = ?, rows_updated = ?, detail = ?, finished_at = datetime('now') WHERE id = ?`
    )
    .run(succeeded, failed, rowsUpdated, JSON.stringify(detail), id);
}

export function listAnalysisRuns(limit = 20): Record<string, unknown>[] {
  return getDb()
    .prepare(`SELECT * FROM analysis_runs ORDER BY id DESC LIMIT ?`)
    .all(limit) as Record<string, unknown>[];
}

// ---------- adaption runs ----------

export function logAdaptionRun(
  operation: string,
  mode: "live" | "local-adapter",
  inputRows: number,
  status: string,
  summary: Record<string, unknown>
): number {
  const info = getDb()
    .prepare(
      `INSERT INTO adaption_runs (operation, mode, input_rows, status, summary) VALUES (?, ?, ?, ?, ?)`
    )
    .run(operation, mode, inputRows, status, JSON.stringify(summary));
  return Number(info.lastInsertRowid);
}

export function listAdaptionRuns(limit = 20): Record<string, unknown>[] {
  return getDb()
    .prepare(`SELECT * FROM adaption_runs ORDER BY id DESC LIMIT ?`)
    .all(limit) as Record<string, unknown>[];
}

// ---------- issues ----------

export function replaceAutoIssues(issues: Omit<IssueRow, "id" | "created_at" | "updated_at">[]): void {
  const database = getDb();
  // Preserve status of existing auto issues matched by title.
  const existing = database
    .prepare(`SELECT title, status FROM issues WHERE auto_generated = 1`)
    .all() as { title: string; status: string }[];
  const statusByTitle = new Map(existing.map((e) => [e.title, e.status]));
  const tx = database.transaction(() => {
    database.prepare(`DELETE FROM issues WHERE auto_generated = 1`).run();
    const stmt = database.prepare(
      `INSERT INTO issues (title, description, category, primary_topic, frequency_raw, frequency_unique,
        negative_count, priority_score, priority_band, priority_explanation, recommendation,
        evidence_ids, status, auto_generated)
       VALUES (@title, @description, @category, @primary_topic, @frequency_raw, @frequency_unique,
        @negative_count, @priority_score, @priority_band, @priority_explanation, @recommendation,
        @evidence_ids, @status, @auto_generated)`
    );
    for (const issue of issues) {
      const preserved = statusByTitle.get(issue.title);
      stmt.run({ ...issue, status: preserved ?? issue.status });
    }
  });
  tx();
}

export function listIssues(status?: string): IssueRow[] {
  if (status && ["open", "in_progress", "resolved"].includes(status)) {
    return getDb()
      .prepare(`SELECT * FROM issues WHERE status = ? ORDER BY priority_score DESC, id ASC`)
      .all(status) as IssueRow[];
  }
  return getDb()
    .prepare(`SELECT * FROM issues ORDER BY priority_score DESC, id ASC`)
    .all() as IssueRow[];
}

export function getIssueById(id: number): IssueRow | undefined {
  return getDb().prepare(`SELECT * FROM issues WHERE id = ?`).get(id) as
    | IssueRow
    | undefined;
}

export function updateIssueStatus(id: number, status: string): boolean {
  return (
    getDb()
      .prepare(`UPDATE issues SET status = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(status, id).changes > 0
  );
}
