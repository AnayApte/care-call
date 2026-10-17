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


if __name__ == "__main__":
    unittest.main()
