// SQLite layer via node:sqlite. DB lives in ~/.teachme (private, outside repo).
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const HOME = homedir();
export const DB_DIR = join(HOME, ".teachme");
export const DB_PATH = join(DB_DIR, "teachme.db");
const SCHEMA_PATH = join(process.cwd(), "db", "schema.sql");

export function openDb() {
  mkdirSync(DB_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  try { db.prepare("SELECT COUNT(*) FROM concepts").get(); }
  catch { db.exec(readFileSync(SCHEMA_PATH, "utf8")); }
  return db;
}
