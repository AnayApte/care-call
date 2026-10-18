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
        if path == "/camera.mjpg":
            self.serve_camera()
            return
        if path in ("/", "/patient", "/caregiver", "/beacon") or path.startswith("/caregiver/reports/"):
            self.path = "/index.html"
        super().do_GET()

    def serve_camera(self):
        """Stream frames from the Pi's only connected USB camera (QNX unit 5)."""
        try:
            import cv2
            from qnx_camera import QnxCamera
        except Exception as exc:
            self.send_error(503, f"Pi camera unavailable: {exc}")
            return

        try:
            camera = QnxCamera(unit=5)
        except Exception as exc:
            self.send_error(503, f"Pi USB camera unit 5 unavailable: {exc}")
            return

        self.send_response(200)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
        self.end_headers()
        try:
            while True:
                frame = camera.read()
                height, width = frame.shape[:2]
                scale = min(1.0, 320 / width, 240 / height)
                if scale < 1.0:
                    frame = cv2.resize(
                        frame,
                        (max(1, round(width * scale)), max(1, round(height * scale))),
                        interpolation=cv2.INTER_AREA,
                    )
                ok, jpeg = cv2.imencode(
                    ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 55]
                )
                if not ok:
                    continue
                payload = jpeg.tobytes()
                self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                                 + str(len(payload)).encode("ascii") + b"\r\n\r\n"
                                 + payload + b"\r\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            camera.close()


if __name__ == "__main__":
    if not (DIST / "index.html").is_file():
        raise SystemExit("Build the web frontend and copy web/dist to the Pi first.")
    print("Care Call frontend: http://127.0.0.1:5173/patient", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 5173), Frontend).serve_forever()
