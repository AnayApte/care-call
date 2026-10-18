# Status: alex

Updated: 2026-10-18

Works:
- Pulled origin/main from 1976f36 to 80dd366 without conflicts.
- Transferred the complete tracked project snapshot at 32cb92c (main 80dd366 plus Alex's preparation notes) to qnxuser@172.20.10.2:/data/home/qnxuser/care-call. Verified archive SHA256 and all 197 extracted files against the archive. No local secrets or installed dependency folders copied.
- Confirmed ml/baseline.json loads as baseline_v2: 42 inputs, 32-dimensional embedding, 34 baseline classes. Python inference code and reference vectors are present.
- Target reports QNX 8.0.0, RaspberryPi5 aarch64le, Python 3.14.0. Archive retained at /data/home/qnxuser/care-call-32cb92c.tar (SHA256 4df607a9360471a25e82eb288556685787b636af10bbd85bd3f1fa532dac42cd).

Blocked / need:
- NumPy, OpenCV (cv2) and MediaPipe are missing on this QNX Python installation. venv and pip are available. Node was not found on PATH; no /dev/video* or /dev/camera* entries were listed.
- Live inference and camera access remain unverified. No dependency installation or application startup was performed.

Next:
- Establish QNX-compatible inference dependencies and camera capture before running the model reference checks and camera smoke test.
- The existing camera_test.py uses a GUI and needs ml/data created before its model download. Baseline inference alone does not provide personalized request recognition; that also requires saved samples, kNN and request lifecycle handling.
