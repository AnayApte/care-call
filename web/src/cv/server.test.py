"""Read-only integration checks against Anay's server using a temporary database.

Run from repo root: python web/src/cv/server.test.py
Uses existing server dependencies. No physical device or external message is sent.
"""
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
os.environ.update(ENABLE_PHOTON="false", ENABLE_PHONE_CALL="false", ENABLE_CREAO="false",
                  DEVICE_TOKEN="local-test-device-token")

from fastapi.testclient import TestClient
from server import db
from server.main import app


class DeviceFlow(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="care-call-arm-check-")
        db.DB_PATH = str(Path(self.temp.name) / "test.sqlite")
        self.context = TestClient(app)
        self.client = self.context.__enter__()
        self.headers = {"X-Device-Token": "local-test-device-token"}

    def tearDown(self):
        self.context.__exit__(None, None, None)
        self.temp.cleanup()

    def test_help_device_ack(self):
        self.assertEqual(self.client.get("/api/device/health").status_code, 503)
        response = self.client.post("/api/requests", json={"patient_id": "p_demo", "label": "help",
                                                          "confidence": .9, "source": "browser"})
        self.assertEqual(response.status_code, 201)
        request = response.json()
        state = self.client.get("/api/device/state", headers=self.headers).json()
        self.assertEqual(state["mode"], "alert")
        self.assertEqual(state["active_request"]["id"], request["id"])
        self.assertEqual(state["active_request"]["display"], "Help")
        beat = self.client.post("/api/device/heartbeat", headers=self.headers,
                                json={"device_id": "beacon_1", "rssi": -50})
        self.assertEqual(beat.status_code, 200)
        self.assertEqual(self.client.get("/api/device/health").status_code, 200)
        ack = self.client.post("/api/device/ack", headers=self.headers, json={"device_id": "beacon_1"})
        self.assertEqual(ack.json()["acked_by"], "button")
        self.assertEqual(ack.json()["status"], "acked")
        self.assertEqual(self.client.get("/api/device/state", headers=self.headers).json()["mode"], "acked")
        self.assertEqual(self.client.get("/api/requests?patient_id=p_demo").json()[0]["status"], "acked")

    def test_device_requires_token(self):
        self.assertEqual(self.client.get("/api/device/state").status_code, 401)
        self.assertEqual(self.client.post("/api/device/ack", json={"device_id": "beacon_1"}).status_code, 401)

    def test_added_word_can_be_requested(self):
        word = {"label": "tea", "display": "Tea", "speech": "I would like some tea, please."}
        self.assertEqual(self.client.post("/api/requests", json={"patient_id": "p_demo", "label": "tea",
                                                                 "confidence": .9}).status_code, 422)
        added = self.client.post("/api/patients/p_demo/vocabulary", json=word)
        self.assertEqual(added.status_code, 201)
        self.assertEqual(added.json()["vocabulary"][-1], word)
        self.assertEqual(self.client.get("/api/patients/p_demo").json()["vocabulary"][-1], word)
        self.assertEqual(self.client.post("/api/patients/p_demo/vocabulary", json=word).status_code, 409)
        for bad in ({**word, "label": "neutral"}, {**word, "label": "water"}):
            self.assertEqual(self.client.post("/api/patients/p_demo/vocabulary", json=bad).status_code, 409)
        self.assertEqual(self.client.post("/api/patients/p_demo/vocabulary",
                                          json={**word, "label": "Tea Time"}).status_code, 422)
        request = self.client.post("/api/requests", json={"patient_id": "p_demo", "label": "tea", "confidence": .9})
        self.assertEqual(request.status_code, 201)
        self.assertEqual(request.json()["speech"], word["speech"])

    def test_clearing_vocabulary_keeps_the_defaults(self):
        self.client.post("/api/patients/p_demo/vocabulary", json={"label": "tea", "display": "Tea", "speech": "Tea, please."})
        for label in ("tea", "water"):
            self.client.post("/api/patients/p_demo/samples", json={"label": label, "vector": [0.0] * 42})
        cleared = self.client.delete("/api/patients/p_demo/vocabulary")
        self.assertEqual(cleared.status_code, 200)
        self.assertEqual(cleared.json(), {"deleted": 1})
        labels = [w["label"] for w in self.client.get("/api/patients/p_demo").json()["vocabulary"]]
        self.assertEqual(labels, ["water", "pain", "help", "bathroom"])
        self.assertEqual([s["label"] for s in self.client.get("/api/patients/p_demo/samples").json()], ["water"])
        self.assertEqual(self.client.post("/api/requests", json={"patient_id": "p_demo", "label": "tea",
                                                                 "confidence": .9}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
