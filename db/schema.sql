-- Teach Me runtime schema v1 (SQLite)
PRAGMA user_version = 1;

CREATE TABLE concepts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    module_id TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'eventually'
        CHECK (stage IN ('docket','off_docket','eventually')),
    objective TEXT NOT NULL,
    session_hours REAL NOT NULL DEFAULT 1.5,
    tier TEXT NOT NULL DEFAULT 'core'
        CHECK (tier IN ('core','important','nice')),
    evidence_strength TEXT NOT NULL DEFAULT 'medium'
        CHECK (evidence_strength IN ('strong','medium','weak','evidence_uncertain')),
    prereqs TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE modules (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'eventually'
        CHECK (stage IN ('eventually','in_progress','off_docket')),
    exit_probe TEXT,
    portfolio_output TEXT,
    prereq_module_ids TEXT NOT NULL DEFAULT '[]',
    artifact_status TEXT NOT NULL DEFAULT 'none'
        CHECK (artifact_status IN ('none','drafted','gap_iterated','done'))
);

CREATE TABLE concept_state (
    concept_id TEXT PRIMARY KEY,
    interval_days REAL NOT NULL DEFAULT 1.0,
    due_at TEXT NOT NULL,
    ease REAL NOT NULL DEFAULT 2.5,
    last_result TEXT,
    success_count INTEGER NOT NULL DEFAULT 0,
    transfer_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    concept_id TEXT NOT NULL,
    ts TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('recall','transfer','teachback','calibration')),
    outcome TEXT NOT NULL CHECK (outcome IN ('pass','partial','fail')),
    confidence INTEGER CHECK (confidence BETWEEN 0 AND 100),
    interval REAL,
    due_at TEXT,
    notes TEXT
);

CREATE TABLE exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled','in_progress','passed','failed')),
    taken_at TEXT
);

CREATE TABLE exam_items (
    exam_id INTEGER NOT NULL,
    concept_id TEXT NOT NULL,
    outcome TEXT,
    attempt INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (exam_id, concept_id)
);

CREATE TABLE artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'drafted'
        CHECK (status IN ('drafted','gap_iterated','done')),
    created_at TEXT,
    path TEXT,
    gap_list TEXT,
    gap_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE calibration (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    concept_id TEXT,
    predicted REAL NOT NULL,
    actual_outcome TEXT NOT NULL,
    delta REAL NOT NULL
);

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
