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
- Epiphany does not launch in the QNX VNC desktop: the Pi has no X display (`cannot open display`) and no QNX Screen compatible browser was found in its package repository. The static site is reachable from the Pi; the browser window itself is not available in this VNC image.

Next:
- From a Mac, an SSH tunnel can display the Pi-hosted frontend in the Mac browser: `ssh -fN -o ExitOnForwardFailure=yes -L 15173:127.0.0.1:5173 qnxuser@172.20.10.2 && open http://127.0.0.1:15173/patient`. This appears on the Mac desktop; opening the browser inside VNC requires a QNX image with a supported graphical browser.
- To show the native camera/model preview, run `cd ~/care-call && .venv/bin/python3 edge/bedside/vision.py --camera-unit 5 --display` from a QNX graphical session with an OpenCV display backend.
- The native preview reports generic pose classes from the baseline. It does not yet load personalized request meanings or post requests.
- Added a Pi-hosted `/camera.mjpg` endpoint that captures only USB camera unit 5 so the browser can receive the camera over the existing SSH tunnel. Python syntax check passes.
- Patient page now selects only “Pi USB camera (unit 5)”, uses its stream for MediaPipe tracking and preview, and never calls Mac `getUserMedia`. Deployed the updated frontend and camera server to the Pi; its `/patient` page serves the new bundle and `/camera.mjpg` responds HTTP 200 with multipart frames. `npm run build` and all 15 frontend tests pass.
