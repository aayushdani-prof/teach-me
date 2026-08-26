"""FSRS-lite scheduler: computes due items, applies outcome -> next interval."""

from datetime import datetime, timedelta, timezone

PASS_MULT = 2.0
PARTIAL_MULT = 1.3
FAIL_MULT = 0.4
MAX_INTERVAL_DAYS = 60.0
MIN_INTERVAL_DAYS = 1.0
DEFAULT_EASE = 2.5
DAILY_CAP_ITEMS = 10
DAILY_CAP_MINUTES = 15.0


def _utcnow():
    return datetime.now(timezone.utc)


def compute_due(conn, cap_items=DAILY_CAP_ITEMS):
    """Return concepts due now, ordered overdue-first -> lowest ease -> oldest."""
    rows = conn.execute(
        """
        SELECT c.id, c.title, c.module_id, cs.interval_days, cs.due_at, cs.ease,
               cs.success_count, c.objective
        FROM concept_state cs
        JOIN concepts c ON c.id = cs.concept_id
        WHERE cs.due_at <= ?
          AND c.stage IN ('docket', 'off_docket')
        ORDER BY
          CASE WHEN cs.due_at < ? THEN 0 ELSE 1 END,  -- overdue first
          cs.ease ASC,
          cs.due_at ASC
        LIMIT ?
        """,
        (_utcnow().isoformat(timespec="seconds").replace("+00:00", "Z"),
         _utcnow().isoformat(timespec="seconds").replace("+00:00", "Z"),
         cap_items),
    ).fetchall()
    return rows


def apply_outcome(conn, concept_id, outcome, confidence=None, kind="recall", notes=None):
    """Apply a grading; returns new interval + due date."""
    now = _utcnow()
    row = conn.execute(
        "SELECT * FROM concept_state WHERE concept_id = ?", (concept_id,)
    ).fetchone()
    if row is None:
        raise ValueError(f"no concept_state for {concept_id}")
    interval = row["interval_days"]
    ease = row["ease"]
    if outcome == "pass":
        interval = interval * PASS_MULT
    elif outcome == "partial":
        interval = interval * PARTIAL_MULT
    elif outcome == "fail":
        interval = interval * FAIL_MULT
    else:
        raise ValueError(f"bad outcome {outcome}")
    interval = max(MIN_INTERVAL_DAYS, min(MAX_INTERVAL_DAYS, interval))
    due = now + timedelta(days=interval)
    due_iso = due.isoformat(timespec="seconds").replace("+00:00", "Z")
    success_count = row["success_count"] + (1 if outcome == "pass" else 0)
    conn.execute(
        """UPDATE concept_state
           SET interval_days = ?, due_at = ?, ease = ?, last_result = ?, success_count = ?
           WHERE concept_id = ?""",
        (interval, due_iso, ease, outcome, success_count, concept_id),
    )
    conn.execute(
        """INSERT INTO reviews (concept_id, ts, kind, outcome, confidence, interval, due_at, notes)
           VALUES (?,?,?,?,?,?,?,?)""",
        (concept_id, now.isoformat(timespec="seconds").replace("+00:00", "Z"),
         kind, outcome, confidence, interval, due_iso, notes),
    )
    conn.commit()
    return interval, due_iso
