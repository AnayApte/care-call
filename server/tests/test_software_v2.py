"""Local-only v2 checks. Temporary DB; no agent, voice, message or phone calls."""
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

os.environ.update(ENABLE_PHOTON="false", ENABLE_PHONE_CALL="false", ENABLE_CREAO="false",
                  DEVICE_TOKEN="local-v2-test", SENTRY_DSN="")
from fastapi.testclient import TestClient
from server import config, db, store
from server.main import app


class SoftwareV2(unittest.TestCase):
    def setUp(self):
        token = patch.object(config, "DEVICE_TOKEN", "local-v2-test")
        token.start()
        self.addCleanup(token.stop)
        self.temp = tempfile.TemporaryDirectory(prefix="care-call-v2-")
        db.DB_PATH = str(Path(self.temp.name) / "test.sqlite")
        self.context = TestClient(app)
        self.client = self.context.__enter__()
        self.payload = {"patient_id": "p_demo", "label": "water", "confidence": .9,
                        "source": "browser", "client_request_id": "one-gesture"}

    def tearDown(self):
        self.context.__exit__(None, None, None)
        self.temp.cleanup()

    def test_retry_returns_same_request_and_schedules_once(self):
        with patch("server.escalation.start") as start:
            first = self.client.post("/api/requests", json=self.payload).json()
            retry = self.client.post("/api/requests", json=self.payload).json()
            self.assertEqual(first, retry)
            self.assertEqual(start.call_count, 1)
        self.assertEqual(len(store.list_requests()), 1)
        self.assertEqual(self.client.post("/api/requests", json={**self.payload, "label": "pain"}).status_code, 409)
        self.assertEqual(self.client.get(f"/api/requests/{first['id']}").json(), first)
        self.assertEqual(self.client.get("/api/requests/r_9999").status_code, 404)

    def test_parallel_retries_have_one_id(self):
        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(lambda _: store.create_request_once("p_demo", "water", .9, "browser", "parallel"), range(8)))
        self.assertEqual(len({r[0]["id"] for r in results}), 1)
        self.assertEqual(sum(r[1] for r in results), 1)

    def test_device_ack_targets_displayed_request_and_keeps_legacy(self):
        first = self.client.post("/api/requests", json=self.payload).json()
        second = self.client.post("/api/requests", json={**self.payload, "label": "help", "client_request_id": "second"}).json()
        headers = {"X-Device-Token": "local-v2-test"}
        url = "/api/device/ack"
        ack = self.client.post(url, headers=headers, json={"device_id": "caregiver_1", "request_id": first["id"]}).json()
        self.assertEqual(ack["id"], first["id"])
        self.assertEqual(store.get_request(second["id"])["status"], "open")
        self.assertEqual(self.client.post(url, headers=headers, json={"device_id": "caregiver_1", "request_id": first["id"]}).json(), ack)
        self.assertEqual(self.client.post(url, headers=headers, json={"device_id": "caregiver_1", "request_id": "r_9999"}).status_code, 404)
        self.assertEqual(store.get_request(second["id"])["status"], "open")
        self.assertEqual(self.client.post(url, headers=headers, json={"device_id": "caregiver_1"}).json()["id"], second["id"])

    def test_parallel_ack_changes_state_once(self):
        req = store.create_request("p_demo", "water", .9, "browser")
        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(lambda _: store.ack_request_once(req["id"], "dashboard"), range(8)))
        self.assertEqual(sum(r[1] for r in results), 1)
        self.assertEqual(len({r[0]["acked_at"] for r in results}), 1)

    def test_optional_feedback_has_one_current_vote_and_no_learning(self):
        req = self.client.post("/api/requests", json=self.payload).json()
        self.client.post(f"/api/requests/{req['id']}/ack", json={"by": "dashboard"})
        self.assertEqual(store.recent_feedback("p_demo"), [])
        url = f"/api/requests/{req['id']}/feedback"
        body = {"correct": False, "intended_label": "pain"}
        first = self.client.post(url, json=body).json()
        self.assertEqual(self.client.post(url, json=body).json(), first)
        self.client.post(url, json={"correct": True, "intended_label": "water"})
        votes = self.client.get("/api/patients/p_demo/feedback").json()
        self.assertEqual(len(votes), 1)
        self.assertTrue(votes[0]["correct"])
        self.assertEqual(store.list_samples("p_demo"), [])
        self.assertEqual(self.client.post(url, json={"correct": True, "intended_label": "pain"}).status_code, 422)
        self.assertEqual(self.client.post(url, json={"correct": False, "intended_label": "water"}).status_code, 422)
        self.assertEqual(self.client.post(url, json={"correct": False, "intended_label": "neutral"}).status_code, 201)

    def test_atomic_label_replacement_preserves_other_styles(self):
        old_water = store.add_sample("p_demo", "water", [0.] * 42)
        store.add_sample("p_demo", "pain", [1.] * 42)
        url = "/api/patients/p_demo/samples/pain"
        self.assertEqual(self.client.put(url, json={"vectors": [[2.] * 42] * 14}).status_code, 422)
        self.assertEqual(len(store.list_samples("p_demo")), 2)
        self.assertEqual(self.client.put(url, json={"vectors": [[2.] * 41] * 15}).status_code, 422)
        saved = self.client.put(url, json={"vectors": [[2.] * 42] * 15}).json()
        self.assertEqual(len(saved), 15)
        self.assertTrue(all(s["vector"] == [2.] * 42 for s in saved))
        self.assertEqual([s for s in store.list_samples("p_demo") if s["label"] == "water"], [old_water])
        self.client.put(url, json={"vectors": [[2.] * 42] * 15})
        self.assertEqual(len(store.list_samples("p_demo")), 16)
        self.assertEqual(self.client.put("/api/patients/p_demo/samples/wrong", json={"vectors": [[2.] * 42] * 15}).status_code, 422)
        self.assertEqual(self.client.put(url, content='{"vectors":[' + ','.join(['[' + ','.join(['NaN'] * 42) + ']'] * 15) + ']}', headers={"Content-Type": "application/json"}).status_code, 422)

    def test_session_retry_deduplicates_but_legacy_still_works(self):
        body = {"patient_id": "p_demo", "session_id": "practice-1", "started_at": "2026-10-18T02:00:00Z",
                "ended_at": "2026-10-18T02:10:00Z", "labels": {}, "confusions": []}
        first = self.client.post("/api/cv/sessions", json=body).json()
        self.assertEqual(self.client.post("/api/cv/sessions", json=body).json(), first)
        self.assertEqual(self.client.post("/api/cv/sessions", json={**body, "false_triggers_neutral": 1}).status_code, 409)
        self.assertEqual(len(store.recent_sessions("p_demo")), 1)
        del body["session_id"]
        self.assertEqual(self.client.post("/api/cv/sessions", json=body).status_code, 201)

    def test_additive_migration_keeps_old_data(self):
        legacy = str(Path(self.temp.name) / "legacy.sqlite")
        with sqlite3.connect(legacy) as conn:
            conn.executescript(db.SCHEMA)
            conn.execute("INSERT INTO samples(patient_id,label,vector,created_at) VALUES (?,?,?,?)", ("p_demo", "water", db.dumps([0.] * 42), store.now_iso()))
            conn.execute("INSERT INTO cv_sessions(patient_id,summary,created_at) VALUES (?,?,?)", ("p_demo", '{"patient_id":"p_demo"}', store.now_iso()))
        db.DB_PATH = legacy
        db.init(); db.init()
        self.assertEqual(len(store.list_samples("p_demo")), 1)
        self.assertEqual(len(store.recent_sessions("p_demo")), 1)
        self.assertTrue(store.create_request_once("p_demo", "water", .9, "browser", "migrated")[1])

    def test_live_counts_replace_snapshot_then_close_without_double_counting(self):
        body = {"patient_id": "p_demo", "session_id": "running-1", "started_at": "2026-10-18T02:00:00Z",
                "ended_at": "2026-10-18T02:01:00Z", "labels": {"water": {
                    "attempts": 1, "fired": 1, "abandoned": 0}}, "confusions": []}
        live_url = "/api/patients/p_demo/live-session"
        usage_url = "/api/patients/p_demo/usage"
        self.assertEqual(self.client.put(live_url, json=body).status_code, 200)
        self.assertEqual(self.client.get("/api/patients/p_demo/sessions").json(), [])
        newer = {**body, "ended_at": "2026-10-18T02:02:00Z", "labels": {"water": {
            "attempts": 2, "fired": 1, "abandoned": 1}}}
        self.client.put(live_url, json=newer)
        self.client.put(live_url, json=body)  # A slow older reply cannot roll back counts.
        usage = self.client.get(usage_url).json()
        self.assertEqual(len(usage), 1)
        self.assertTrue(usage[0]["live"])
        self.assertEqual(usage[0]["labels"]["water"]["attempts"], 2)
        self.client.post("/api/cv/sessions", json=newer)
        self.client.put(live_url, json=body)  # A late live upload cannot reopen a closed window.
        usage = self.client.get(usage_url).json()
        self.assertEqual(len(usage), 1)
        self.assertFalse(usage[0]["live"])
        self.assertEqual(usage[0]["labels"]["water"]["attempts"], 2)

    def test_live_usage_validates_patient_id_and_dates(self):
        body = {"patient_id": "p_demo", "session_id": "running-1", "started_at": "2026-10-18T02:00:00Z",
                "ended_at": "2026-10-18T02:01:00Z", "labels": {}, "confusions": []}
        url = "/api/patients/p_demo/live-session"
        for overrides in ({"patient_id": "other"}, {"session_id": None}, {"ended_at": "bad"},
                          {"started_at": "2026-10-18T02:00:00"}):
            self.assertEqual(self.client.put(url, json={**body, **overrides}).status_code, 422)

    def test_creao_review_receives_current_usage_without_starting_automatically(self):
        body = {"patient_id": "p_demo", "session_id": "live-for-review", "started_at": "2026-10-18T02:00:00Z",
                "ended_at": "2026-10-18T02:01:00Z", "labels": {}, "confusions": []}
        with patch("server.integrations.creao.start_adaptation", return_value="synthetic-run") as start, \
             patch("server.integrations.creao.configuration_status", return_value={"ready": True}), \
             patch.object(config, "ENABLE_CREAO", True):
            self.client.put("/api/patients/p_demo/live-session", json=body)
            self.client.get("/api/patients/p_demo/usage")
            self.assertEqual(start.call_count, 0)
            self.assertEqual(self.client.post("/api/adapt/run", json={"patient_id": "p_demo"}).status_code, 202)
            self.assertTrue(start.call_args.kwargs["sessions"][0]["live"])


if __name__ == "__main__":
    unittest.main()
