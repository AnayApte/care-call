"""No live CREAO calls: verify the wire format and approval boundary."""
import copy
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ.update(ENABLE_PHOTON="false", ENABLE_PHONE_CALL="false", ENABLE_CREAO="false",
                  SEED_DEMO="false", ELEVENLABS_API_KEY="", SENTRY_DSN="")

import httpx
from fastapi.testclient import TestClient
from server import config, db, store
from server.integrations import creao
from server.main import app
from server.models import DEFAULT_ADAPT_CONFIG

AGENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
RUN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
PROPOSAL = {**DEFAULT_ADAPT_CONFIG, "version": 2, "labels": {"pain": {"hold_frames": 9}}, "retrain_labels": ["pain"]}
RESULT = {"proposal": PROPOSAL, "explanation_md": "SIMULATED TEST RESPONSE: record Pain again."}


class CreaoWire(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, CREAO_API_KEY="capi_test-only", CREAO_AGENT_ID=AGENT)
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def test_app_key_uses_official_origin_and_session_text(self):
        calls = []
        def handle(request):
            calls.append(request)
            return httpx.Response(200, json={"id": RUN})
        factory = httpx.Client
        with patch.object(creao.httpx, "Client", side_effect=lambda **kw: factory(transport=httpx.MockTransport(handle), **kw)):
            self.assertEqual(creao.start_adaptation(patient={"id": "p_demo"}, config=DEFAULT_ADAPT_CONFIG,
                                                    sessions=[], feedback=[]), RUN)
        req = calls[0]
        self.assertEqual(str(req.url), f"https://agent.creao.ai/api/v1/apps/{AGENT}/runs")
        self.assertEqual(req.headers["authorization"], "Bearer capi_test-only")
        data = json.loads(json.loads(req.content)["inputs"]["session_data"])
        self.assertEqual(data["config"]["version"], 1)
        self.assertNotIn("samples", data)

    def test_account_key_uses_account_payload(self):
        with patch.dict(os.environ, CREAO_API_KEY="cr_sk_test-only"), patch.object(creao, "_request", return_value={"run_id": RUN}) as request:
            creao.start_adaptation(patient={}, config=DEFAULT_ADAPT_CONFIG, sessions=[], feedback=[])
            self.assertEqual(request.call_args.args[1], "/v1/runs")
            self.assertEqual(request.call_args.args[2]["agent_id"], AGENT)
            self.assertIn("session_data", request.call_args.args[2]["input"])

    def test_completed_output_is_bounded_and_preserves_explanation(self):
        raw = copy.deepcopy(RESULT)
        raw["proposal"].update(hold_frames=100, min_confidence=.1)
        raw["proposal"]["labels"]["invented"] = {"hold_frames": 1}
        with patch.object(creao, "_request", return_value={"status": "completed", "result": {"text": json.dumps(raw)}}):
            result = creao.get_adaptation(RUN)
        self.assertEqual(result["status"], "done")
        self.assertEqual(result["proposal"]["hold_frames"], 30)
        self.assertEqual(result["proposal"]["min_confidence"], .6)
        self.assertNotIn("invented", result["proposal"]["labels"])
        self.assertEqual(result["explanation_md"], RESULT["explanation_md"])

    def test_pending_and_failed_runs_never_invent_proposals(self):
        for status in ("pending", "queued", "running", "failed", "cancelled", "unknown"):
            with self.subTest(status=status), patch.object(creao, "_request", return_value={"status": status}):
                result = creao.get_adaptation(RUN)
                self.assertIsNone(result["proposal"])
                self.assertEqual(result["status"], "pending" if status in ("pending", "queued", "running") else "failed")

    def test_full_proposal_in_chat_text_is_read_when_text_is_a_saved_summary(self):
        reply = {**RESULT, "explanation_md": "Synthetic reports.\\n\\nRecord Pain again."}
        run = {"status": "completed", "result": {
            "text": json.dumps({"proposal_version": 2, "session_data": "saved summary"}),
            "chatText": json.dumps(reply),
        }}
        with patch.object(creao, "_request", return_value=run):
            result = creao.get_adaptation(RUN)
        self.assertEqual(result["status"], "done")
        self.assertEqual(result["proposal"]["retrain_labels"], ["pain"])
        self.assertEqual(result["explanation_md"], "Synthetic reports.\n\nRecord Pain again.")

    def test_bad_json_missing_explanation_and_invalid_numbers_fail(self):
        for output in ("not json", {}, {"proposal": PROPOSAL}, {**RESULT, "proposal": {**PROPOSAL, "hold_frames": float("nan")}}):
            with self.subTest(output=output), patch.object(creao, "_request", return_value={"status": "completed", "result": output}):
                self.assertEqual(creao.get_adaptation(RUN), creao.FAILED)
        with patch.object(creao, "_request", side_effect=httpx.ConnectError("offline")):
            self.assertEqual(creao.get_adaptation(RUN), creao.FAILED)

    def test_invalid_job_never_reaches_network(self):
        with patch.object(creao, "_request") as request:
            self.assertEqual(creao.get_adaptation("../../elsewhere"), creao.FAILED)
            request.assert_not_called()


class ApprovalFlow(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="carecall-creao-")
        db.DB_PATH = str(Path(self.temp.name) / "test.sqlite")
        self.ctx = TestClient(app)
        self.client = self.ctx.__enter__()

    def tearDown(self):
        self.ctx.__exit__(None, None, None)
        self.temp.cleanup()

    def test_disabled_setup_is_honest_and_hides_credentials(self):
        self.assertEqual(self.client.get("/api/adapt/setup").json(), {"ready": False})
        self.assertEqual(self.client.post("/api/adapt/run", json={"patient_id": "p_demo"}).status_code, 503)

    def test_run_and_poll_do_not_apply_then_explicit_apply_does(self):
        with patch.object(config, "ENABLE_CREAO", True), patch.object(creao, "configuration_status", return_value={"ready": True}), \
                patch.object(creao, "start_adaptation", return_value=RUN), \
                patch.object(creao, "get_adaptation", return_value={"status": "done", **RESULT}):
            started = self.client.post("/api/adapt/run", json={"patient_id": "p_demo"}).json()
            self.assertEqual(started["base_config"]["version"], 1)
            self.assertEqual(self.client.get(f"/api/adapt/{RUN}").json()["status"], "done")
            self.assertEqual(store.get_adapt_config("p_demo")["version"], 1)
            saved = self.client.put("/api/patients/p_demo/adapt-config?expected_version=1", json=PROPOSAL)
            self.assertEqual(saved.status_code, 200)
            self.assertEqual(saved.json()["labels"]["pain"], {"hold_frames": 9, "min_confidence": .8})
            self.assertEqual(store.get_adapt_config("p_demo")["version"], 2)

    def test_outdated_apply_returns_409_without_overwriting(self):
        path = "/api/patients/p_demo/adapt-config?expected_version=1"
        self.assertEqual(self.client.put(path, json=PROPOSAL).status_code, 200)
        response = self.client.put(path, json={**PROPOSAL, "hold_frames": 6})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(store.get_adapt_config("p_demo")["hold_frames"], 12)

    def test_report_endpoint_returns_latest_five_only(self):
        for i in range(7):
            store.add_session({"patient_id": "p_demo", "ended_at": f"2026-10-17T12:0{i}:00Z"})
        reports = self.client.get("/api/patients/p_demo/sessions").json()
        self.assertEqual(len(reports), 5)
        self.assertTrue(reports[0]["ended_at"].endswith("06:00Z"))


if __name__ == "__main__":
    unittest.main()
