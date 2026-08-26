// Persisted per-concept conversation threads (local, in ~/.teachme/threads).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const THREADS_DIR = join(homedir(), ".teachme", "threads");
mkdirSync(THREADS_DIR, { recursive: true });
const fileFor = (conceptId) => join(THREADS_DIR, `${conceptId}.json`);

export function getThread(conceptId) {
  const p = fileFor(conceptId);
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return []; }
}
export function appendThread(conceptId, role, content) {
  const t = getThread(conceptId);
  t.push({ role, content, ts: new Date().toISOString() });
  writeFileSync(fileFor(conceptId), JSON.stringify(t, null, 2));
  return t;
}
