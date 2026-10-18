"""Seed synthetic demo data for Maria: gesture session summaries (contract section 19)
and a day of answered requests for the caregiver dashboard (section 14, no empty states).

Synthetic demo data, not from a real patient. "pain" is the flaky label and is
often confused with "help", so the CREAO agent has something real to work on.
Seeded requests have source "seed" so they are easy to tell apart.
Run from the repo root: server/.venv/bin/python3 -m server.seed
Running it again replaces the earlier seed; Josh's live sessions are kept.
"""
from datetime import datetime, timedelta, timezone

from .models import PATIENT

from . import db, store

PATIENT_ID = "p_demo"

# (days ago, start hour UTC, minutes long, per-label stats, pain->help confusions, neutral false triggers)
SESSIONS = [
    (4, 16, 40, {"water": (8, 7, 0.88, 0.74, 13), "pain": (6, 3, 0.76, 0.55, 19),
                 "help": (5, 5, 0.86, 0.79, 13), "bathroom": (4, 4, 0.85, 0.77, 14)}, 2, 1),
    (3, 17, 35, {"water": (9, 8, 0.87, 0.71, 13), "pain": (7, 3, 0.73, 0.52, 21),
                 "help": (6, 5, 0.84, 0.70, 14), "bathroom": (3, 3, 0.86, 0.80, 13)}, 3, 2),
    (2, 15, 45, {"water": (7, 6, 0.86, 0.72, 14), "pain": (8, 3, 0.72, 0.49, 22),
                 "help": (5, 4, 0.83, 0.68, 14), "bathroom": (5, 5, 0.87, 0.81, 13)}, 4, 1),
    (1, 18, 30, {"water": (9, 6, 0.84, 0.61, 15), "pain": (7, 2, 0.71, 0.48, 22),
                 "help": (6, 5, 0.85, 0.72, 13), "bathroom": (4, 4, 0.86, 0.79, 13)}, 4, 2),
]


def build(days_ago, hour, minutes, labels, pain_help, neutral) -> dict:
    day = datetime.now(timezone.utc) - timedelta(days=days_ago)
    start = day.replace(hour=hour, minute=0, second=0, microsecond=0)
    end = start + timedelta(minutes=minutes)
    iso = lambda d: d.isoformat(timespec="seconds").replace("+00:00", "Z")
    return {
        "patient_id": PATIENT_ID,
        "started_at": iso(start),
        "ended_at": iso(end),
        "config_version": 1,
        "synthetic": True,
        "labels": {
            label: {"attempts": a, "fired": f, "abandoned": a - f, "mean_conf": mean,
                    "min_conf": low, "mean_hold_frames_to_fire": hold}
            for label, (a, f, mean, low, hold) in labels.items()
        },
        "confusions": [{"intended": "pain", "predicted": "help", "count": pain_help}],
        "false_triggers_neutral": neutral,
    }


# (hours ago, label, confidence, acked_by, seconds to ack, caregiver said it was wrong)
REQUESTS = [
    (21.5, "water", 0.91, "button", 14, False),
    (19.0, "bathroom", 0.88, "button", 22, False),
    (16.2, "pain", 0.72, "imessage", 41, True),   # really meant "help": feeds the CREAO story
    (13.8, "water", 0.93, "dashboard", 9, False),
    (11.0, "help", 0.86, "button", 17, False),
    (8.5, "water", 0.89, "button", 12, False),
    (6.1, "pain", 0.81, "imessage", 33, False),
    (4.0, "bathroom", 0.90, "dashboard", 11, False),
    (2.3, "help", 0.84, "button", 19, False),
    (0.9, "water", 0.92, "button", 8, False),
]


def _iso(dt: datetime) -> str:
    return dt.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def seed_requests() -> int:
    """Replace earlier seeded requests with a fresh day of answered ones."""
    words = {w["label"]: w for w in PATIENT["vocabulary"]}
    now = datetime.now(timezone.utc)
    with db.connect() as conn:
        # Also clears deploy smoke tests so the dashboard only shows Maria's story.
        conn.execute("DELETE FROM feedback WHERE request_n IN"
                     " (SELECT n FROM requests WHERE source IN ('seed', 'smoke_test'))")
        conn.execute("DELETE FROM requests WHERE source IN ('seed', 'smoke_test')")
        for hours_ago, label, conf, by, secs, wrong in REQUESTS:
            created = now - timedelta(hours=hours_ago)
            acked = created + timedelta(seconds=secs)
            level = 1 if by == "imessage" else 0  # iMessage acks mean the text went out at 20 s
            cur = conn.execute(
                "INSERT INTO requests (patient_id, label, display, speech, confidence, source, status,"
                " escalation_level, created_at, acked_at, acked_by, ack_latency_ms)"
                " VALUES (?,?,?,?,?,'seed','acked',?,?,?,?,?)",
                (PATIENT_ID, label, words[label]["display"], words[label]["speech"], conf, level,
                 _iso(created), _iso(acked), by, secs * 1000))
            if wrong:
                conn.execute("INSERT INTO feedback (request_n, patient_id, correct, created_at) VALUES (?,?,0,?)",
                             (cur.lastrowid, PATIENT_ID, _iso(acked + timedelta(minutes=2))))
    return len(REQUESTS)


def main() -> None:
    db.init()
    removed = store.delete_synthetic_sessions(PATIENT_ID)
    for row in SESSIONS:
        store.add_session(build(*row), synthetic=True)
    print(f"seeded {len(SESSIONS)} synthetic sessions for {PATIENT_ID} (replaced {removed}) in {db.DB_PATH}")
    print(f"seeded {seed_requests()} answered requests (source 'seed')")


if __name__ == "__main__":
    main()
