#!/usr/bin/env node
// Compute today's due count and fire a macOS notification (used by the LaunchAgent).
import { execFileSync } from "node:child_process";
import { openDb } from "../server/db.js";
import { computeDue } from "../server/scheduler.js";

const db = openDb();
const capItems = Number(db.prepare("SELECT value FROM settings WHERE key='daily_cap_items'").get()?.value ?? 10);
const capMinutes = Number(db.prepare("SELECT value FROM settings WHERE key='daily_cap_minutes'").get()?.value ?? 15);
const due = computeDue(db);
db.close();

if (due.length === 0) {
  console.log("Teach Me: nothing due today.");
  process.exit(0);
}

const shown = due.length;
const minutes = Math.max(1, Math.round((shown / capItems) * capMinutes));
const title = "Teach Me — daily review";
const msg = `${shown} concept${shown === 1 ? "" : "s"} due today · ~${minutes} min. Open http://localhost:4173`;

try {
  execFileSync("osascript", ["-e", `display notification ${JSON.stringify(msg)} with title ${JSON.stringify(title)}`]);
  console.log("notification sent:", msg);
} catch (e) {
  console.error("could not send notification:", e.message);
  process.exit(1);
}
