"""Server state in SQLite. Routes and the escalation timer only talk to these functions."""
import json
import time
from datetime import datetime, timezone
from typing import Optional

from . import config, db
from .models import PATIENTS


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
        rows = conn.execute("SELECT * FROM requests WHERE (? IS NULL OR patient_id=?) ORDER BY n DESC",
                            (patient_id, patient_id)).fetchall()
    out = [_request(r) for r in rows]
    if since is not None:
        out = [r for r in out if parse_iso(r["created_at"]) > since]
    return out


def open_requests() -> list[dict]:
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM requests WHERE status='open' ORDER BY n DESC").fetchall()
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


def last_heartbeat_age_s() -> Optional[float]:
    with db.connect() as conn:
        row = conn.execute("SELECT MAX(last_heartbeat_at) AS t FROM devices").fetchone()
    return None if row["t"] is None else time.time() - row["t"]


def device_state(device_id: str) -> dict:
    with db.connect() as conn:
        # One beacon for the demo: acks are recorded on the default device.
        dev = conn.execute("SELECT * FROM devices WHERE device_id=?", (config.DEFAULT_DEVICE_ID,)).fetchone()
        acked = None
        if dev and dev["acked_until"] and dev["acked_until"] > time.time():
            acked = conn.execute("SELECT * FROM requests WHERE n=?", (dev["acked_request_n"],)).fetchone()
    if acked:
        return {"device_id": device_id, "mode": "acked",
                "active_request": {"id": f"r_{acked['n']}", "display": acked["display"],
                                   "created_at": acked["created_at"]},
                "message": config.ACKED_MESSAGE}
    req = latest_open_request()
    if req:
        return {"device_id": device_id, "mode": "alert",
                "active_request": {"id": req["id"], "display": req["display"], "created_at": req["created_at"]},
                "message": None}
    return {"device_id": device_id, "mode": "idle", "active_request": None, "message": None}
