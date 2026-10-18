"""Step 5 API checks using a temporary database and no external agent calls."""
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
os.environ.update(ENABLE_PHOTON="false", ENABLE_PHONE_CALL="false", ENABLE_CREAO="false",
                  SEED_DEMO="false", ELEVENLABS_API_KEY="", SENTRY_DSN="")

from fastapi.testclient import TestClient
from server import db, store
from server.main import app


class AdaptationFlow(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="care-call-adaptation-")
        db.DB_PATH = str(Path(self.temp.name) / "test.sqlite")
        self.context = TestClient(app)
        self.client = self.context.__enter__()

    def tearDown(self):
        self.context.__exit__(None, None, None)
        self.temp.cleanup()

    def test_report_is_available_to_the_agent_route(self):
        summary = {
            "patient_id": "p_demo", "started_at": "2026-10-18T02:00:00Z",
            "ended_at": "2026-10-18T02:10:00Z", "config_version": 2,
            "labels": {"water": {"attempts": 2, "fired": 1, "abandoned": 1,
                "mean_conf": .9, "min_conf": .8, "mean_hold_frames_to_fire": 12}},
            "confusions": [], "false_triggers_neutral": 0,
        }
        response = self.client.post("/api/cv/sessions", json=summary)
        self.assertEqual(response.status_code, 201)
        saved = store.recent_sessions("p_demo", 5)[0]
        self.assertEqual(saved["config_version"], 2)
        self.assertEqual(saved["labels"], summary["labels"])

    def test_approved_settings_keep_per_label_retraining(self):
        approved = {"version": 2, "hold_frames": 12, "min_confidence": .8,
                    "labels": {"pain": {"hold_frames": 6, "min_confidence": .9}},
                    "retrain_labels": ["pain"]}
        response = self.client.put("/api/patients/p_demo/adapt-config", json=approved)
        self.assertEqual(response.status_code, 200)
        loaded = self.client.get("/api/patients/p_demo/adapt-config").json()
        self.assertEqual(loaded["labels"], approved["labels"])
        self.assertEqual(loaded["retrain_labels"], ["pain"])
        self.assertEqual(loaded["version"], 2)

    def test_agent_off_keeps_the_live_settings_available(self):
        self.assertEqual(self.client.post("/api/adapt/run", json={"patient_id": "p_demo"}).status_code, 503)
        self.assertEqual(self.client.get("/api/patients/p_demo/adapt-config").status_code, 200)
        result = self.client.get("/api/adapt/no-real-agent").json()
        self.assertEqual(result["status"], "failed")
        self.assertIsNone(result["proposal"])


if __name__ == "__main__":
    unittest.main()
