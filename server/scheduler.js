// FSRS-lite scheduler (mirrors src/teachme/scheduler.py).
const PASS_MULT = 2.0, PARTIAL_MULT = 1.3, FAIL_MULT = 0.4;
const MAX_INTERVAL_DAYS = 60.0, MIN_INTERVAL_DAYS = 1.0;

export function nowIso() {
  return new Date().toISOString();
}
export function applyOutcome(db, conceptId, outcome, { kind = "recall", confidence = null, notes = null } = {}) {
  const row = db.prepare("SELECT * FROM concept_state WHERE concept_id = ?").get(conceptId);
  if (!row) throw new Error(`no concept_state for ${conceptId}`);
  let interval = row.interval_days;
  if (outcome === "pass") interval *= PASS_MULT;
  else if (outcome === "partial") interval *= PARTIAL_MULT;
  else if (outcome === "fail") interval *= FAIL_MULT;
  else throw new Error(`bad outcome ${outcome}`);
  interval = Math.max(MIN_INTERVAL_DAYS, Math.min(MAX_INTERVAL_DAYS, interval));
  const due = new Date(Date.now() + interval * 86400000).toISOString();
  const successCount = row.success_count + (outcome === "pass" ? 1 : 0);
  db.prepare(`UPDATE concept_state SET interval_days=?, due_at=?, last_result=?, success_count=? WHERE concept_id=?`)
    .run(interval, due, outcome, successCount, conceptId);
  db.prepare(`INSERT INTO reviews (concept_id, ts, kind, outcome, confidence, interval, due_at, notes)
              VALUES (?,?,?,?,?,?,?,?)`)
    .run(conceptId, nowIso(), kind, outcome, confidence, interval, due, notes);
  return { interval, due };
}

export function computeDue(db, capItems = 10) {
  const now = nowIso();
  return db.prepare(`
    SELECT c.id, c.title, c.module_id, c.objective, cs.interval_days, cs.due_at, cs.ease, cs.success_count
    FROM concept_state cs JOIN concepts c ON c.id = cs.concept_id
    WHERE cs.due_at <= ? AND c.stage IN ('docket','off_docket')
    ORDER BY (cs.due_at < ?) DESC, cs.ease ASC, cs.due_at ASC
    LIMIT ?`).all(now, now, capItems);
}
