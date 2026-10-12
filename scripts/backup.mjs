#!/usr/bin/env node
/**
 * Offline SQLite backup for InsightFlow.
 *
 * Uses VACUUM INTO, which reads the live database into a compact,
 * self-contained snapshot without modifying or locking out the source
 * beyond a brief read transaction. Safe to run while the server is up.
 *
 * Usage: node scripts/backup.mjs [db-path] [out-path]
 * Defaults: ./data/insightflow.db -> ./backups/insightflow-<timestamp>.db
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "package.json"));
const Database = require("better-sqlite3");

const dbPath = process.argv[2] || path.join(process.cwd(), "data", "insightflow.db");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outPath =
  process.argv[3] || path.join(process.cwd(), "backups", `insightflow-${stamp}.db`);

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const db = new Database(dbPath, { readonly: true });
db.exec(`VACUUM INTO '${outPath.replace(/'/g, "''")}'`);
db.close();
const verify = new Database(outPath, { readonly: true });
const rows = verify.prepare("SELECT COUNT(*) AS n FROM feedback").get();
verify.close();
console.log(`Backup written: ${outPath} (${rows.n} feedback rows)`);
