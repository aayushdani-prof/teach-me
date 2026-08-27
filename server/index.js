import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { openDb } from "./db.js";
import { computeDue, applyOutcome, nowIso } from "./scheduler.js";
import { chat, extractGaps } from "./agent.js";
import { getThread, appendThread } from "./threads.js";

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
  if (url.pathname === "/api/thread" && req.method === "GET") {
    const conceptId = url.searchParams.get("conceptId");
    return send(res, 200, JSON.stringify({ thread: getThread(conceptId) }));
  }
  if (url.pathname === "/api/concepts" && req.method === "GET") {
    const rows = db.prepare("SELECT * FROM concepts ORDER BY module_id, id").all();
    const modules = db.prepare("SELECT * FROM modules ORDER BY id").all();
    return send(res, 200, JSON.stringify({ concepts: rows, modules }));
  }
  if (url.pathname === "/api/concepts" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const { title, objective, moduleId, tier = "core", prereqs = "", source } = JSON.parse(body || "{}");
        if (!title || !objective) return send(res, 400, JSON.stringify({ error: "title and objective required" }));
        const id = "C" + Date.now().toString().slice(-6);
        // ensure module exists
        const mod = db.prepare("SELECT id FROM modules WHERE id = ?").get(moduleId || "M0");
        if (!mod) db.prepare("INSERT INTO modules (id, title, stage) VALUES (?,?, 'in_progress')").run(moduleId || "M0", moduleId ? title : "Manual Module");
        const prereqArr = String(prereqs || "").split(",").map((s) => s.trim()).filter(Boolean);
        db.prepare(
          `INSERT INTO concepts (id, title, module_id, stage, objective, session_hours, tier, evidence_strength, prereqs)
           VALUES (?,?,?,?,?,?,?,?,?)`
        ).run(id, title, moduleId || "M0", "docket", objective, 1.5, tier, "medium", JSON.stringify(prereqArr));
        db.prepare(
          `INSERT INTO concept_state (concept_id, interval_days, due_at, ease, success_count, transfer_count)
           VALUES (?,?,?,?,?,?)`
        ).run(id, 1.0, nowIso(), 2.5, 0, 0);
        send(res, 200, JSON.stringify({ ok: true, id }));
      } catch (e) { send(res, 400, JSON.stringify({ error: e.message })); }
    });
    return;
  }
  if (url.pathname === "/api/chat" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const { conceptId, message } = JSON.parse(body || "{}");
        const concept = db.prepare("SELECT * FROM concepts WHERE id = ?").get(conceptId);
        if (!concept) return send(res, 404, JSON.stringify({ error: "unknown concept" }));
        appendThread(conceptId, "user", message);
        const thread = getThread(conceptId);
        const reply = await chat(
          [
            { role: "system", content: `Concept: ${concept.title}\nObjective: ${concept.objective}\nModule: ${concept.module_id}` },
            ...thread.map((m) => ({ role: m.role, content: m.content })),
          ],
          { system: "drilldown_system" }
        );
        appendThread(conceptId, "assistant", reply);
        // Reliable gap detection: dedicated extractor call, then persist
        const gaps = await extractGaps(concept.title, getThread(conceptId));
        for (const g of gaps) {
          db.prepare(
            `INSERT INTO gaps (concept_id, missing, depth, ts, status, source_thread)
             VALUES (?,?,?,?,?,?)`
          ).run(conceptId, g.missing, g.depth ?? 1, nowIso(), "open", conceptId);
          db.prepare(
            `INSERT INTO reviews (concept_id, ts, kind, outcome, confidence, interval, due_at, notes)
             VALUES (?,?,?,?,?,?,?,?)`
          ).run(conceptId, nowIso(), "calibration", "fail", null, 1.0, nowIso(), `gap: ${g.missing}`);
        }
        send(res, 200, JSON.stringify({ reply, thread: getThread(conceptId), gaps }));
      } catch (e) { send(res, 500, JSON.stringify({ error: e.message })); }
    });
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    return send(res, 404, JSON.stringify({ error: "unknown api" }));
  }
  serveStatic(url.pathname, res);
});

server.listen(PORT, () => console.log(`Teach Me running → http://localhost:${PORT}`));
