import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { openDb } from "./db.js";
import { computeDue, applyOutcome, nowIso } from "./scheduler.js";

const db = openDb();
const PORT = process.env.PORT || 4173;
const ROOT = process.cwd();
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".md": "text/plain; charset=utf-8",
};

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type });
  res.end(body);
}
function serveStatic(pathname, res) {
  const safe = join(ROOT, "public", pathname === "/" ? "index.html" : pathname);
  try { statSync(safe); } catch { send(res, 404, "not found", "text/plain"); return; }
  send(res, 200, readFileSync(safe), MIME[extname(safe)] || "application/octet-stream");
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/today" && req.method === "GET") {
    return send(res, 200, JSON.stringify({ due: computeDue(db) }));
  }
  if (url.pathname === "/api/review" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const { conceptId, outcome, confidence } = JSON.parse(body || "{}");
        const r = applyOutcome(db, conceptId, outcome, { confidence });
        send(res, 200, JSON.stringify(r));
      } catch (e) { send(res, 400, JSON.stringify({ error: e.message })); }
    });
    return;
  }
  if (url.pathname === "/api/progress" && req.method === "GET") {
    const rows = db.prepare(`
      SELECT c.id, c.title, c.stage, c.module_id, cs.interval_days, cs.success_count
      FROM concepts c LEFT JOIN concept_state cs ON c.id = cs.concept_id
      ORDER BY c.module_id, c.id`).all();
    const cal = db.prepare("SELECT COUNT(*) n FROM calibration").get().n;
    return send(res, 200, JSON.stringify({ concepts: rows, calibrationCount: cal }));
  }
  if (url.pathname === "/api/meta" && req.method === "GET") {
    const total = db.prepare("SELECT COUNT(*) n FROM concepts").get().n;
    const mastered = db.prepare("SELECT COUNT(*) n FROM concepts WHERE stage='off_docket'").get().n;
    return send(res, 200, JSON.stringify({ total, mastered }));
  }
  if (url.pathname.startsWith("/api/")) {
    return send(res, 404, JSON.stringify({ error: "unknown api" }));
  }
  serveStatic(url.pathname, res);
});

server.listen(PORT, () => console.log(`Teach Me running → http://localhost:${PORT}`));
