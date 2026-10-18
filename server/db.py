"""SQLite access. One short-lived connection per call keeps threads (timers, routes) safe."""
import json
import os
import sqlite3
from contextlib import contextmanager

from .config import SERVER_DIR

DB_PATH = os.environ.get("DB_PATH", str(SERVER_DIR / "carecall.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS samples (
    n INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT NOT NULL,
    label TEXT NOT NULL,
    vector TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS requests (
    n INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT NOT NULL,
    label TEXT NOT NULL,
    display TEXT NOT NULL,
    speech TEXT NOT NULL,
    confidence REAL NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    escalation_level INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    acked_at TEXT,
    acked_by TEXT,
    ack_latency_ms INTEGER
);
CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    last_heartbeat_at REAL,
    rssi INTEGER,
    acked_request_n INTEGER,
    acked_until REAL
);
CREATE TABLE IF NOT EXISTS cv_sessions (
    n INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    synthetic INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cv_live_sessions (
    patient_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (patient_id, session_id)
);
CREATE TABLE IF NOT EXISTS feedback (
    n INTEGER PRIMARY KEY AUTOINCREMENT,
    request_n INTEGER NOT NULL,
    patient_id TEXT NOT NULL,
    correct INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vocabulary (
    patient_id TEXT NOT NULL,
    label TEXT NOT NULL,
    display TEXT NOT NULL,
    speech TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (patient_id, label)
);
CREATE TABLE IF NOT EXISTS adapt_configs (
    patient_id TEXT PRIMARY KEY,
    config TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH, timeout=5)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)
        # Additive migrations: keep existing requests, recordings and reports.
        for table, column in (("requests", "client_request_id"), ("cv_sessions", "session_id"),
                              ("feedback", "intended_label")):
            columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
            if column not in columns:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} TEXT")
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS request_retry_key "
                     "ON requests(patient_id, client_request_id) WHERE client_request_id IS NOT NULL")
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS session_retry_key "
                     "ON cv_sessions(patient_id, session_id) WHERE session_id IS NOT NULL")


def dumps(value) -> str:
    return json.dumps(value, separators=(",", ":"))
