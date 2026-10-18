#!/usr/bin/env python3
"""Serve the built Care Call frontend on the Pi's local VNC browser."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

DIST = Path(__file__).resolve().parents[2] / "web/dist"


class Frontend(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path in ("/", "/patient", "/caregiver", "/beacon") or path.startswith("/caregiver/reports/"):
            self.path = "/index.html"
        super().do_GET()


if __name__ == "__main__":
    if not (DIST / "index.html").is_file():
        raise SystemExit("Build the web frontend and copy web/dist to the Pi first.")
    print("Care Call frontend: http://127.0.0.1:5173/patient", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 5173), Frontend).serve_forever()
