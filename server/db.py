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
CREATE TABLE IF NOT EXISTS feedback (
    n INTEGER PRIMARY KEY AUTOINCREMENT,
    request_n INTEGER NOT NULL,
    patient_id TEXT NOT NULL,
    correct INTEGER NOT NULL,
    created_at TEXT NOT NULL
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


def dumps(value) -> str:
    return json.dumps(value, separators=(",", ":"))
