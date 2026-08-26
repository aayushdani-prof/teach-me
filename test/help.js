// minimal smoke test for scheduler
import { openDb } from "../server/db.js";
import { applyOutcome, computeDue } from "../server/scheduler.js";
const db = openDb();
// seed one concept if missing
const c = db.prepare("SELECT COUNT(*) n FROM concepts").get().n;
if (!c) {
  db.prepare(`INSERT INTO modules (id,title,stage) VALUES ('M0','Test','in_progress')`).run();
  db.prepare(`INSERT INTO concepts (id,title,module_id,stage,objective) VALUES ('C1','x','M0','docket','obj')`).run();
  db.prepare(`INSERT INTO concept_state (concept_id,interval_days,due_at,ease,success_count,transfer_count) VALUES ('C1',1.0,? ,2.5,0,0)`).run(new Date(0).toISOString());
}
console.log("due count:", computeDue(db).length);
const r = applyOutcome(db, "C1", "pass");
console.log("after pass:", r.interval, r.due);
db.close();
