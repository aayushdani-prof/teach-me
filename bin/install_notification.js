#!/usr/bin/env node
// Install/uninstall the Teach Me daily-review LaunchAgent (macOS).
// Usage: node bin/install_notification.js [install|uninstall]
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { openDb } from "../server/db.js";

const HOME = homedir();
const LAUNCH_AGENTS = join(HOME, "Library", "LaunchAgents");
const PLIST = join(LAUNCH_AGENTS, "com.teachme.review.plist");
const NOTIFY_SCRIPT = join(process.cwd(), "bin", "notify.js");
const LOG_DIR = join(HOME, ".teachme", "logs");
const NODE = process.execPath;
const UID = process.getuid();

function uninstall() {
  try { execFileSync("launchctl", ["bootout", `gui/${UID}`, PLIST], { stdio: "ignore" }); } catch {}
  try { execFileSync("launchctl", ["unload", PLIST], { stdio: "ignore" }); } catch {}
  if (existsSync(PLIST)) rmSync(PLIST);
  console.log("Teach Me notification agent removed.");
}

function install() {
  mkdirSync(LAUNCH_AGENTS, { recursive: true });
  mkdirSync(LOG_DIR, { recursive: true });
  const db = openDb();
  const time = (db.prepare("SELECT value FROM settings WHERE key='reminder_time'").get()?.value || "08:30").split(":");
  db.close();
  const hour = Number(time[0]);
  const minute = Number(time[1] ?? 0);
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.teachme.review</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE}</string>
    <string>${NOTIFY_SCRIPT}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>${hour}</integer>
    <key>Minute</key><integer>${minute}</integer>
  </dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>${join(LOG_DIR, "notify.out.log")}</string>
  <key>StandardErrorPath</key><string>${join(LOG_DIR, "notify.err.log")}</string>
</dict>
</plist>`;
  writeFileSync(PLIST, plist);
  try { execFileSync("launchctl", ["bootout", `gui/${UID}`, PLIST], { stdio: "ignore" }); } catch {}
  execFileSync("launchctl", ["bootstrap", `gui/${UID}`, PLIST]);
  console.log(`Teach Me notification agent installed → daily ${hour}:${String(minute).padStart(2, "0")} (${PLIST})`);
}

const action = process.argv[2] || "install";
if (action === "uninstall") uninstall();
else install();
