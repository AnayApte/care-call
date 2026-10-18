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


def replace_samples(patient_id: str, label: str, vectors: list[list[float]]) -> list[dict]:
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("DELETE FROM samples WHERE patient_id=? AND label=?", (patient_id, label))
        conn.executemany("INSERT INTO samples (patient_id,label,vector,created_at) VALUES (?,?,?,?)",
                         [(patient_id, label, db.dumps(v), now_iso()) for v in vectors])
        rows = conn.execute("SELECT * FROM samples WHERE patient_id=? AND label=? ORDER BY n",
                            (patient_id, label)).fetchall()
    return [_sample(row) for row in rows]


# Vocabulary: the default words plus any the patient added

def vocabulary(patient_id: str) -> list[dict]:
    with db.connect() as conn:
        rows = conn.execute("SELECT label, display, speech FROM vocabulary WHERE patient_id=? ORDER BY created_at",
                            (patient_id,)).fetchall()
    return PATIENTS[patient_id]["vocabulary"] + [dict(r) for r in rows]


def add_word(patient_id: str, label: str, display: str, speech: str) -> bool:
    """False when the label is already a word (or neutral)."""
    if label == "neutral" or any(w["label"] == label for w in vocabulary(patient_id)):
        return False
    with db.connect() as conn:
        conn.execute("INSERT OR IGNORE INTO vocabulary (patient_id, label, display, speech, created_at) VALUES (?,?,?,?,?)",
                     (patient_id, label, display.strip(), speech.strip(), now_iso()))
    return True


def clear_vocabulary(patient_id: str) -> int:
    """Removes the added words and their recordings. The defaults stay."""
    with db.connect() as conn:
        conn.execute("DELETE FROM samples WHERE patient_id=? AND label IN"
                     " (SELECT label FROM vocabulary WHERE patient_id=?)", (patient_id, patient_id))
        return conn.execute("DELETE FROM vocabulary WHERE patient_id=?", (patient_id,)).rowcount


# Requests

def _request(row) -> dict:
    return {"id": f"r_{row['n']}", "patient_id": row["patient_id"], "label": row["label"],
            "display": row["display"], "speech": row["speech"], "confidence": row["confidence"],
            "source": row["source"], "status": row["status"], "escalation_level": row["escalation_level"],
            "created_at": row["created_at"], "acked_at": row["acked_at"], "acked_by": row["acked_by"],
            "ack_latency_ms": row["ack_latency_ms"]}


def create_request(patient_id: str, label: str, confidence: float, source: str) -> dict:
    return create_request_once(patient_id, label, confidence, source)[0]


def create_request_once(patient_id: str, label: str, confidence: float, source: str,
                        client_request_id: str | None = None) -> tuple[dict, bool]:
    word = next(w for w in vocabulary(patient_id) if w["label"] == label)
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        if client_request_id is not None:
            existing = conn.execute("SELECT * FROM requests WHERE patient_id=? AND client_request_id=?",
                                    (patient_id, client_request_id)).fetchone()
            if existing:
                if (existing["label"], existing["confidence"], existing["source"]) != (label, confidence, source):
                    raise ValueError("Request key already used for a different request")
                return _request(existing), False
        cur = conn.execute(
            "INSERT INTO requests (patient_id, label, display, speech, confidence, source, created_at, client_request_id)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (patient_id, label, word["display"], word["speech"], confidence, source, now_iso(), client_request_id))
        row = conn.execute("SELECT * FROM requests WHERE n=?", (cur.lastrowid,)).fetchone()
    return _request(row), True


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
    return ack_request_once(request_id, by)[0]


def ack_request_once(request_id: str, by: str) -> tuple[Optional[dict], bool]:
    """Ack an open request. Returns the request, or None if not found. Acking twice changes nothing."""
    n = _n(request_id, "r")
    if n is None:
        return None, False
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM requests WHERE n=?", (n,)).fetchone()
        if row is None:
            return None, False
        changed = row["status"] == "open"
        if changed:
            acked_at = datetime.now(timezone.utc)
            latency = int((acked_at - parse_iso(row["created_at"])).total_seconds() * 1000)
            conn.execute("UPDATE requests SET status='acked', acked_at=?, acked_by=?, ack_latency_ms=?"
                         " WHERE n=? AND status='open'", (now_iso(), by, latency, n))
            conn.execute("INSERT INTO devices (device_id, acked_request_n, acked_until) VALUES (?,?,?)"
                         " ON CONFLICT(device_id) DO UPDATE SET acked_request_n=excluded.acked_request_n,"
                         " acked_until=excluded.acked_until",
                         (config.DEFAULT_DEVICE_ID, n, time.time() + config.ACKED_DISPLAY_S))
            row = conn.execute("SELECT * FROM requests WHERE n=?", (n,)).fetchone()
    return _request(row), changed


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
        conn.execute("BEGIN IMMEDIATE")
        session_id = summary.get("session_id")
        if session_id:
            existing = conn.execute("SELECT * FROM cv_sessions WHERE patient_id=? AND session_id=?",
                                    (summary["patient_id"], session_id)).fetchone()
            if existing:
                saved = json.loads(existing["summary"])
                if saved != summary:
                    raise ValueError("Session key already used for a different report")
                return {"id": f"cs_{existing['n']}", **saved}
        cur = conn.execute("INSERT INTO cv_sessions (patient_id, summary, synthetic, created_at, session_id) VALUES (?,?,?,?,?)",
                           (summary["patient_id"], db.dumps(summary), int(synthetic), now_iso(), session_id))
        if session_id:
            conn.execute("DELETE FROM cv_live_sessions WHERE patient_id=? AND session_id=?",
                         (summary["patient_id"], session_id))
    return {"id": f"cs_{cur.lastrowid}", **summary}


def update_live_session(summary: dict) -> dict:
    """Replace a running window's counts; immutable saved reports keep their retry rules."""
    patient_id, session_id = summary["patient_id"], summary["session_id"]
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        if conn.execute("SELECT 1 FROM cv_sessions WHERE patient_id=? AND session_id=?",
                        (patient_id, session_id)).fetchone():
            return {"saved": True}
        row = conn.execute("SELECT summary FROM cv_live_sessions WHERE patient_id=? AND session_id=?",
                           (patient_id, session_id)).fetchone()
        if row and parse_iso(json.loads(row["summary"])["ended_at"]) > parse_iso(summary["ended_at"]):
            return {"saved": False}
        conn.execute("INSERT INTO cv_live_sessions(patient_id,session_id,summary,updated_at) VALUES (?,?,?,?)"
                     " ON CONFLICT(patient_id,session_id) DO UPDATE SET summary=excluded.summary,updated_at=excluded.updated_at",
                     (patient_id, session_id, db.dumps(summary), now_iso()))
    return {"saved": False}


def recent_usage(patient_id: str, limit: int = 5) -> list[dict]:
    """Saved and running windows, counted once even while a final upload completes."""
    with db.connect() as conn:
        # One read transaction prevents a final upload between the two queries.
        conn.execute("BEGIN")
        saved = conn.execute("SELECT * FROM cv_sessions WHERE patient_id=?", (patient_id,)).fetchall()
        live = conn.execute("SELECT * FROM cv_live_sessions WHERE patient_id=?", (patient_id,)).fetchall()
    sessions = [{"id": f"cs_{r['n']}", **json.loads(r["summary"]), "live": False,
                 "synthetic": bool(r["synthetic"])} for r in saved]
    saved_ids = {s.get("session_id") for s in sessions}
    sessions.extend({**json.loads(r["summary"]), "live": True, "updated_at": r["updated_at"]}
                    for r in live if r["session_id"] not in saved_ids)
    sessions.sort(key=lambda x: x.get("ended_at", ""), reverse=True)
    return sessions[:limit]


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

def add_feedback(request_id: str, correct: bool, intended_label: str | None = None) -> Optional[dict]:
    req = get_request(request_id)
    if req is None:
        return None
    if correct and intended_label is not None and intended_label != req["label"]:
        raise ValueError("A correct answer must name the predicted word")
    if not correct and intended_label == req["label"]:
        raise ValueError("An incorrect answer must name a different word")
    created = now_iso()
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        previous = conn.execute("SELECT * FROM feedback WHERE request_n=? ORDER BY n DESC LIMIT 1",
                                (_n(request_id, "r"),)).fetchone()
        if previous:
            n = previous["n"]
            if bool(previous["correct"]) == correct and previous["intended_label"] == intended_label:
                created = previous["created_at"]
            else:
                conn.execute("UPDATE feedback SET correct=?,intended_label=?,created_at=? WHERE n=?",
                             (int(correct), intended_label, created, n))
        else:
            cur = conn.execute("INSERT INTO feedback (request_n, patient_id, correct, created_at, intended_label) VALUES (?,?,?,?,?)",
                               (_n(request_id, "r"), req["patient_id"], int(correct), created, intended_label))
            n = cur.lastrowid
    return {"id": f"f_{n}", "request_id": request_id, "correct": correct,
            "intended_label": intended_label, "created_at": created}


def recent_feedback(patient_id: str, limit: int = 20) -> list[dict]:
    """Newest first, joined with the request so the agent knows what was flagged."""
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT f.n, f.correct, f.intended_label, f.created_at, r.n AS rn, r.label, r.confidence, r.source"
            " FROM feedback f JOIN requests r ON r.n = f.request_n"
            " WHERE f.patient_id=? AND f.n=(SELECT MAX(v.n) FROM feedback v WHERE v.request_n=f.request_n)"
            " ORDER BY f.created_at DESC LIMIT ?", (patient_id, limit)).fetchall()
    return [{"id": f"f_{r['n']}", "request_id": f"r_{r['rn']}", "label": r["label"],
             "confidence": r["confidence"], "source": r["source"], "correct": bool(r["correct"]),
             "intended_label": r["intended_label"], "created_at": r["created_at"]} for r in rows]


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
