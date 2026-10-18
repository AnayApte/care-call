"""Server state in SQLite. Routes and the escalation timer only talk to these functions."""
import json
import time
from datetime import datetime, timezone
from typing import Optional

from . import config, db
from .models import DEFAULT_ADAPT_CONFIG, PATIENTS


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_iso(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _n(public_id: str, prefix: str) -> Optional[int]:
    """'r_12' -> 12. Anything else -> None."""
    head, _, num = public_id.partition("_")
    return int(num) if head == prefix and num.isdigit() else None


# Samples

def _sample(row) -> dict:
    return {"id": f"s_{row['n']}", "patient_id": row["patient_id"], "label": row["label"],
            "vector": json.loads(row["vector"]), "created_at": row["created_at"]}


def list_samples(patient_id: str) -> list[dict]:
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM samples WHERE patient_id=? ORDER BY n", (patient_id,)).fetchall()
    return [_sample(r) for r in rows]


def add_sample(patient_id: str, label: str, vector: list[float]) -> dict:
    with db.connect() as conn:
        cur = conn.execute("INSERT INTO samples (patient_id, label, vector, created_at) VALUES (?,?,?,?)",
                           (patient_id, label, db.dumps(vector), now_iso()))
        row = conn.execute("SELECT * FROM samples WHERE n=?", (cur.lastrowid,)).fetchone()
    return _sample(row)


def delete_samples(patient_id: str) -> int:
    with db.connect() as conn:
        return conn.execute("DELETE FROM samples WHERE patient_id=?", (patient_id,)).rowcount


# Requests

def _request(row) -> dict:
    return {"id": f"r_{row['n']}", "patient_id": row["patient_id"], "label": row["label"],
            "display": row["display"], "speech": row["speech"], "confidence": row["confidence"],
            "source": row["source"], "status": row["status"], "escalation_level": row["escalation_level"],
            "created_at": row["created_at"], "acked_at": row["acked_at"], "acked_by": row["acked_by"],
            "ack_latency_ms": row["ack_latency_ms"]}


def create_request(patient_id: str, label: str, confidence: float, source: str) -> dict:
    word = next(w for w in PATIENTS[patient_id]["vocabulary"] if w["label"] == label)
    with db.connect() as conn:
        cur = conn.execute(
            "INSERT INTO requests (patient_id, label, display, speech, confidence, source, created_at)"
            " VALUES (?,?,?,?,?,?,?)",
            (patient_id, label, word["display"], word["speech"], confidence, source, now_iso()))
        row = conn.execute("SELECT * FROM requests WHERE n=?", (cur.lastrowid,)).fetchone()
    return _request(row)


def get_request(request_id: str) -> Optional[dict]:
    n = _n(request_id, "r")
    if n is None:
        return None
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM requests WHERE n=?", (n,)).fetchone()
    return _request(row) if row else None


def list_requests(patient_id: Optional[str] = None, since: Optional[datetime] = None) -> list[dict]:
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM requests WHERE (? IS NULL OR patient_id=?) ORDER BY created_at DESC, n DESC",
                            (patient_id, patient_id)).fetchall()
    out = [_request(r) for r in rows]
    if since is not None:
        out = [r for r in out if parse_iso(r["created_at"]) > since]
    return out


def open_requests() -> list[dict]:
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM requests WHERE status='open' ORDER BY created_at DESC, n DESC").fetchall()
    return [_request(r) for r in rows]


def latest_open_request() -> Optional[dict]:
    rows = open_requests()
    return rows[0] if rows else None


def ack_request(request_id: str, by: str) -> Optional[dict]:
    """Ack an open request. Returns the request, or None if not found. Acking twice changes nothing."""
    n = _n(request_id, "r")
    if n is None:
        return None
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM requests WHERE n=?", (n,)).fetchone()
        if row is None:
            return None
        if row["status"] == "open":
            acked_at = datetime.now(timezone.utc)
            latency = int((acked_at - parse_iso(row["created_at"])).total_seconds() * 1000)
            conn.execute("UPDATE requests SET status='acked', acked_at=?, acked_by=?, ack_latency_ms=?"
                         " WHERE n=? AND status='open'", (now_iso(), by, latency, n))
            conn.execute("INSERT INTO devices (device_id, acked_request_n, acked_until) VALUES (?,?,?)"
                         " ON CONFLICT(device_id) DO UPDATE SET acked_request_n=excluded.acked_request_n,"
                         " acked_until=excluded.acked_until",
                         (config.DEFAULT_DEVICE_ID, n, time.time() + config.ACKED_DISPLAY_S))
            row = conn.execute("SELECT * FROM requests WHERE n=?", (n,)).fetchone()
    return _request(row)


def claim_escalation(request_id: str, level: int) -> bool:
    """Move an open request up to `level`. True only for the one caller that did it (idempotency)."""
    n = _n(request_id, "r")
    with db.connect() as conn:
        cur = conn.execute("UPDATE requests SET escalation_level=?"
                           " WHERE n=? AND status='open' AND escalation_level<?", (level, n, level))
        return cur.rowcount == 1


# Device

def record_heartbeat(device_id: str, rssi: Optional[int]) -> None:
    with db.connect() as conn:
        conn.execute("INSERT INTO devices (device_id, last_heartbeat_at, rssi) VALUES (?,?,?)"
                     " ON CONFLICT(device_id) DO UPDATE SET last_heartbeat_at=excluded.last_heartbeat_at,"
                     " rssi=excluded.rssi", (device_id, time.time(), rssi))


def last_heartbeat_age_s(device_id: Optional[str] = None) -> Optional[float]:
    """Seconds since the last heartbeat from `device_id`, or from any device if None."""
    with db.connect() as conn:
        row = conn.execute("SELECT MAX(last_heartbeat_at) AS t FROM devices WHERE ? IS NULL OR device_id=?",
                           (device_id, device_id)).fetchone()
    return None if row["t"] is None else time.time() - row["t"]


def device_heartbeats() -> dict[str, float]:
    """device_id -> seconds since its last heartbeat."""
    with db.connect() as conn:
        rows = conn.execute("SELECT device_id, last_heartbeat_at FROM devices"
                            " WHERE last_heartbeat_at IS NOT NULL").fetchall()
    return {r["device_id"]: round(time.time() - r["last_heartbeat_at"], 1) for r in rows}


def last_ack(window_s: float) -> Optional[dict]:
    """The most recent ack in the last `window_s` seconds, for the bedside "Help is coming"."""
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM requests WHERE status='acked' ORDER BY acked_at DESC LIMIT 1").fetchone()
    if not row or (datetime.now(timezone.utc) - parse_iso(row["acked_at"])).total_seconds() > window_s:
        return None
    return {"request_id": f"r_{row['n']}", "display": row["display"],
            "acked_at": row["acked_at"], "acked_by": row["acked_by"]}


def device_state(device_id: str) -> dict:
    with db.connect() as conn:
        # One beacon for the demo: acks are recorded on the default device.
        dev = conn.execute("SELECT * FROM devices WHERE device_id=?", (config.DEFAULT_DEVICE_ID,)).fetchone()
        acked = None
        if dev and dev["acked_until"] and dev["acked_until"] > time.time():
            acked = conn.execute("SELECT * FROM requests WHERE n=?", (dev["acked_request_n"],)).fetchone()
    recent = last_ack(config.LAST_ACK_WINDOW_S)
    if acked:
        return {"device_id": device_id, "mode": "acked",
                "active_request": {"id": f"r_{acked['n']}", "display": acked["display"],
                                   "created_at": acked["created_at"]},
                "message": config.ACKED_MESSAGE, "last_ack": recent}
    req = latest_open_request()
    if req:
        return {"device_id": device_id, "mode": "alert",
                "active_request": {"id": req["id"], "display": req["display"], "created_at": req["created_at"]},
                "message": None, "last_ack": recent}
    return {"device_id": device_id, "mode": "idle", "active_request": None, "message": None, "last_ack": recent}


# CV session summaries (contract section 19)

def add_session(summary: dict, synthetic: bool = False) -> dict:
    with db.connect() as conn:
        cur = conn.execute("INSERT INTO cv_sessions (patient_id, summary, synthetic, created_at) VALUES (?,?,?,?)",
                           (summary["patient_id"], db.dumps(summary), int(synthetic), now_iso()))
    return {"id": f"cs_{cur.lastrowid}", **summary}


def recent_sessions(patient_id: str, limit: int = 5) -> list[dict]:
    """Newest first, by when the session ended."""
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM cv_sessions WHERE patient_id=?", (patient_id,)).fetchall()
    sessions = [{"id": f"cs_{r['n']}", **json.loads(r["summary"])} for r in rows]
    sessions.sort(key=lambda x: x.get("ended_at", ""), reverse=True)
    return sessions[:limit]


def delete_synthetic_sessions(patient_id: str) -> int:
    with db.connect() as conn:
        return conn.execute("DELETE FROM cv_sessions WHERE patient_id=? AND synthetic=1", (patient_id,)).rowcount


# Caregiver feedback on requests

def add_feedback(request_id: str, correct: bool) -> Optional[dict]:
    req = get_request(request_id)
    if req is None:
        return None
    created = now_iso()
    with db.connect() as conn:
        cur = conn.execute("INSERT INTO feedback (request_n, patient_id, correct, created_at) VALUES (?,?,?,?)",
                           (_n(request_id, "r"), req["patient_id"], int(correct), created))
    return {"id": f"f_{cur.lastrowid}", "request_id": request_id, "correct": correct, "created_at": created}


def recent_feedback(patient_id: str, limit: int = 20) -> list[dict]:
    """Newest first, joined with the request so the agent knows what was flagged."""
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT f.n, f.correct, f.created_at, r.n AS rn, r.label, r.confidence, r.source"
            " FROM feedback f JOIN requests r ON r.n = f.request_n"
            " WHERE f.patient_id=? ORDER BY f.n DESC LIMIT ?", (patient_id, limit)).fetchall()
    return [{"id": f"f_{r['n']}", "request_id": f"r_{r['rn']}", "label": r["label"],
             "confidence": r["confidence"], "source": r["source"], "correct": bool(r["correct"]),
             "created_at": r["created_at"]} for r in rows]


# Approved AdaptConfig

def get_adapt_config(patient_id: str) -> dict:
    with db.connect() as conn:
        row = conn.execute("SELECT config FROM adapt_configs WHERE patient_id=?", (patient_id,)).fetchone()
    return json.loads(row["config"]) if row else dict(DEFAULT_ADAPT_CONFIG)


def set_adapt_config(patient_id: str, config_value: dict, expected_version: int | None = None) -> dict:
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT config FROM adapt_configs WHERE patient_id=?", (patient_id,)).fetchone()
        current = json.loads(row["config"]) if row else DEFAULT_ADAPT_CONFIG
        if expected_version is not None and (current["version"] != expected_version or config_value["version"] != expected_version + 1):
            raise ValueError("Stale adjustment")
        conn.execute("INSERT INTO adapt_configs (patient_id, config, updated_at) VALUES (?,?,?)"
                     " ON CONFLICT(patient_id) DO UPDATE SET config=excluded.config, updated_at=excluded.updated_at",
                     (patient_id, db.dumps(config_value), now_iso()))
    return config_value
