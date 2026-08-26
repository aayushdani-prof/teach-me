// Loads private config from ~/.teachme/.env (never from chat, never committed).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const ENV_PATH = join(homedir(), ".teachme", ".env");
const config = {};
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) config[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
export const OPENAI_API_KEY = config.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
export const OPENAI_BASE_URL = (config.OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
export const MODEL = config.MODEL || "gpt-4o-mini";
