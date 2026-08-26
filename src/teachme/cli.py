"""Teach Me — terminal v1."""

import sys

from . import db, scheduler


def cmd_today(conn):
    due = scheduler.compute_due(conn)
    if not due:
        print("No concepts due today. You're clear.")
        return
    total = len(due)
    print(f"=== Today: {total} due ===")
    for i, r in enumerate(due, 1):
        print(f"  {i}. {r['title']}  [module {r['module_id']}]")


def cmd_review(conn):
    due = scheduler.compute_due(conn)
    if not due:
        print("No review items due. Run `teach` to add new concepts.")
        return
    print(f"Reviewing {len(due)} items...")
    reviewed = 0
    try:
        for r in due:
            print(f"\n--- {r['title']} ({r['module_id']}) ---")
            print(f"  Objective: {r['objective']}")
            try:
                attempt = input("  Your answer (type it, then Enter): ").strip()
            except EOFError:
                print("  [input ended; stopping review here]")
                break
            try:
                grade = input("  Grade yourself [p/pass | pa/partial | f/fail]: ").strip().lower()
            except EOFError:
                print("  [input ended; stopping review here]")
                break
            mapping = {"p": "pass", "pass": "pass",
                       "pa": "partial", "partial": "partial",
                       "f": "fail", "fail": "fail"}
            if grade not in mapping:
                print("  [invalid grade; defaulting to fail]")
                outcome = "fail"
            else:
                outcome = mapping[grade]
            interval, due = scheduler.apply_outcome(conn, r["id"], outcome)
            status = "PASS" if outcome == "pass" else "PARTIAL" if outcome == "partial" else "FAIL"
            print(f"  {status} -> next review in {interval:.0f}d (due {due})")
            reviewed += 1
    except KeyboardInterrupt:
        print("\n[interrupted]")
    print(f"\nReviewed {reviewed} of {len(due)} items.")
    if reviewed < len(due):
        print("Remaining items stay in the queue.")
    print("Run `teach` to add new concepts, or `progress` for status.")


def cmd_progress(conn):
    print("=== Progress ===")
    rows = conn.execute(
        """SELECT c.id, c.title, c.stage, cs.interval_days, cs.success_count
           FROM concepts c LEFT JOIN concept_state cs ON c.id = cs.concept_id
           ORDER BY c.module_id, c.id"""
    ).fetchall()
    for r in rows:
        print(f"  {r['id']}  {r['stage']:<10}  succ={r['success_count']}  int={r['interval_days']}d  {r['title']}")
    print()
    print("=== Calibration ===")
    cal = conn.execute("SELECT COUNT(*) n FROM calibration").fetchone()
    print(f"  {cal['n']} calibration entries")


def cmd_meta(conn):
    print("=== Meta ===")
    total = conn.execute("SELECT COUNT(*) n FROM concepts").fetchone()["n"]
    mastered = conn.execute(
        "SELECT COUNT(*) n FROM concepts WHERE stage='off_docket'"
    ).fetchone()["n"]
    print(f"  concepts: {total} total, {mastered} off_docket")
    print(f"  settings: daily cap {scheduler.DAILY_CAP_ITEMS} items / {scheduler.DAILY_CAP_MINUTES:.0f} min")


COMMANDS = {
    "today": ("show today's due count", cmd_today),
    "review": ("run today's review queue", cmd_review),
    "progress": ("show mastery + state", cmd_progress),
    "meta": ("show weekly view", cmd_meta),
}


def main(argv):
    conn = db.open_or_create()
    if not argv:
        print("Teach Me — terminal v1. Commands:")
        for name, (help_, _) in COMMANDS.items():
            print(f"  {name:<10} {help_}")
        return 0
    cmd = argv[0].lower()
    if cmd in COMMANDS:
        COMMANDS[cmd][1](conn)
        return 0
    if cmd == "teach":
        print("[teach] not wired yet in M1 — seed concepts via bin/seed_demo.py")
        return 0
    print(f"Unknown command: {cmd}")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
