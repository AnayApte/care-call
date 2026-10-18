# Status: alex

Updated: 2026-10-18

Works:
- Pulled origin/main from 1976f36 to 80dd366 without conflicts.
- Transferred the complete tracked project snapshot at 32cb92c (main 80dd366 plus Alex's preparation notes) to qnxuser@172.20.10.2:/data/home/qnxuser/care-call. Verified archive SHA256 and all 197 extracted files against the archive. No local secrets or installed dependency folders copied.
- Installed QNX native NumPy, OpenCV, MediaPipe CPU, Sensor Framework and Screen headers; added a local system-site-packages venv on the Pi.
- Confirmed ml/baseline.json loads as baseline_v2: 42 inputs, 32-dimensional embedding, 34 baseline classes. Python inference code and reference vectors are present.
- Target reports QNX 8.0.0, RaspberryPi5 aarch64le, Python 3.14.0. Archive retained at /data/home/qnxuser/care-call-32cb92c.tar (SHA256 4df607a9360471a25e82eb288556685787b636af10bbd85bd3f1fa532dac42cd).
- Model self-test passes 5 reference vectors with max error 1.19e-6 (tolerance 1e-5). QNX camera adapter compiles, and the native model pipeline processed 147 frames at about 9 fps from USB camera unit 5; it detected a hand in 2 frames during the short check. No request was sent.
- Built the web frontend against the live API, copied it to the Pi and started the local server on 127.0.0.1:5173. Verified `/patient` serves HTML, and the Pi can read live health and Maria API endpoints.

Blocked / need:
- Epiphany launch over SSH failed because the SSH session lacks the active VNC display and D-Bus. Launch the browser from a terminal inside the active VNC desktop.

Next:
- In a VNC desktop terminal, run `epiphany --new-window http://127.0.0.1:5173/patient`. To show the native camera/model preview, run `cd ~/care-call && .venv/bin/python3 edge/bedside/vision.py --camera-unit 5 --display`.
- The native preview reports generic pose classes from the baseline. It does not yet load personalized request meanings or post requests.
