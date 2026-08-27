#!/usr/bin/env node
// Install/uninstall the Teach Me server LaunchAgent (start at login, KeepAlive).
// Usage: node bin/install_server_agent.js [install|uninstall]
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";

const HOME = homedir();
const LAUNCH_AGENTS = join(HOME, "Library", "LaunchAgents");
const PLIST = join(LAUNCH_AGENTS, "com.teachme.server.plist");
const RUN_SCRIPT = join(process.cwd(), "server", "run-server.sh");
const LOG_DIR = join(HOME, ".teachme", "logs");
const UID = process.getuid();

function uninstall() {
  try { execFileSync("launchctl", ["bootout", `gui/${UID}`, PLIST], { stdio: "ignore" }); } catch {}
  try { execFileSync("launchctl", ["unload", PLIST], { stdio: "ignore" }); } catch {}
  console.log("Teach Me server agent removed.");
}

function install() {
  mkdirSync(LAUNCH_AGENTS, { recursive: true });
  mkdirSync(LOG_DIR, { recursive: true });
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.teachme.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${RUN_SCRIPT}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>WorkingDirectory</key><string>${process.cwd()}</string>
  <key>StandardOutPath</key><string>${join(LOG_DIR, "server.out.log")}</string>
  <key>StandardErrorPath</key><string>${join(LOG_DIR, "server.err.log")}</string>
</dict>
</plist>`;
  writeFileSync(PLIST, plist);
  try { execFileSync("launchctl", ["bootout", `gui/${UID}`, PLIST], { stdio: "ignore" }); } catch {}
  execFileSync("launchctl", ["bootstrap", `gui/${UID}`, PLIST]);
  console.log(`Teach Me server agent installed → auto-starts at login, stays up (${PLIST})`);
}

const action = process.argv[2] || "install";
if (action === "uninstall") uninstall();
else install();
