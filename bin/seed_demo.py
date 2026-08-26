#!/usr/bin/env python3
"""Seed a small demo curriculum (real DB rows) for M1."""

import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from teachme import db  # noqa: E402

DEMO_MODULE = {
    "id": "M0",
    "title": "Learning Systems Foundations",
    "stage": "in_progress",
    "exit_probe": "learner can explain what retrieval practice is and why spacing beats cramming",
    "portfolio_output": "a 1-page note on your learning system",
    "prereq_module_ids": "[]",
    "artifact_status": "none",
}

DEMO_CONCEPTS = [
    ("C1", "Retrieval practice", "Explain what retrieval practice is and why it beats re-reading", 1.0, None),
    ("C2", "Spaced repetition basics", "Describe the 1-3-7-14-30-60 interval ladder and why it exists", 1.0, "C1"),
    ("C3", "Desirable difficulty", "Explain why hard-but-doable tasks beat easy review", 1.0, "C1"),
    ("C4", "Calibration training", "Explain why predicting before grading improves learning", 1.0, "C1"),
]


def seed(conn):
    now = datetime.now(timezone.utc)
    conn.execute(
        """INSERT OR REPLACE INTO modules
           (id, title, stage, exit_probe, portfolio_output, prereq_module_ids, artifact_status)
           VALUES (?,?,?,?,?,?,?)""",
        (DEMO_MODULE["id"], DEMO_MODULE["title"], DEMO_MODULE["stage"],
         DEMO_MODULE["exit_probe"], DEMO_MODULE["portfolio_output"],
         DEMO_MODULE["prereq_module_ids"], DEMO_MODULE["artifact_status"]),
    )
    for cid, title, objective, hours, prereq in DEMO_CONCEPTS:
        conn.execute(
            """INSERT OR REPLACE INTO concepts
               (id, title, module_id, stage, objective, session_hours, tier,
                evidence_strength, prereqs)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (cid, title, DEMO_MODULE["id"], "docket", objective, hours, "core", "strong",
             "[]" if prereq is None else f'["{prereq}"]'),
        )
        due = now + timedelta(days=0)
        conn.execute(
            """INSERT OR REPLACE INTO concept_state
               (concept_id, interval_days, due_at, ease, last_result, success_count, transfer_count)
               VALUES (?,?,?,?,?,?,?)""",
            (cid, 1.0, due.isoformat(timespec="seconds").replace("+00:00", "Z"),
             2.5, None, 0, 0),
        )
    # settings
    conn.execute("INSERT OR REPLACE INTO settings VALUES ('daily_cap_items','10')")
    conn.execute("INSERT OR REPLACE INTO settings VALUES ('daily_cap_minutes','15')")
    conn.execute("INSERT OR REPLACE INTO settings VALUES ('reminder_time','08:30')")
    conn.commit()


if __name__ == "__main__":
    conn = db.open_or_create()
    seed(conn)
    print("Seeded demo curriculum: 1 module (M0), 4 concepts (C1-C4), all due now.")
