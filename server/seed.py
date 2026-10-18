"""Seed synthetic gesture session summaries for Maria (contract section 19).

Synthetic demo data, not from a real patient. "pain" is the flaky label and is
often confused with "help", so the CREAO agent has something real to work on.
Run from the repo root: server/.venv/bin/python3 -m server.seed
Running it again replaces the earlier seed; Josh's live sessions are kept.
"""
from datetime import datetime, timedelta, timezone

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


def main() -> None:
    db.init()
    removed = store.delete_synthetic_sessions(PATIENT_ID)
    for row in SESSIONS:
        store.add_session(build(*row), synthetic=True)
    print(f"seeded {len(SESSIONS)} synthetic sessions for {PATIENT_ID} (replaced {removed}) in {db.DB_PATH}")


if __name__ == "__main__":
    main()
