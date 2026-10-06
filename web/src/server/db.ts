import "server-only";

import path from "node:path";
import Database from "better-sqlite3";

/**
 * The read-only analytics database built by `scripts/build_web_data.py`
 * (claims, the pruned evidence index, retrieval runs, predictions, model tables).
 * Opened once per server instance; every query goes through `src/server/*`.
 */
let db: Database.Database | undefined;

export function dbPath(): string {
  return path.join(process.cwd(), "data", "climate.db");
}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath(), { readonly: true, fileMustExist: true });
  }
  return db;
}

export function getMeta<T>(key: string): T {
  const row = getDb().prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    { value: string } | undefined;
  if (!row) throw new Error(`meta key missing: ${key}`);
  return JSON.parse(row.value) as T;
}
