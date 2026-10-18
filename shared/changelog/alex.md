# Changelog: alex

(append entries: time, what changed, why)

2026-10-18 | Pulled main to 80dd366 and prepared an inference-only transfer archive in /tmp from existing ml files. Inspected current model and hardware handoff; awaiting bedside Pi SSH address and OS before transfer. No model weights or other owners' source files changed; Pi execution remains unverified.

2026-10-18 | Transferred project snapshot 32cb92c, including ml/baseline.json and all tracked CV code, to qnxuser@172.20.10.2:/data/home/qnxuser/care-call. Verified archive SHA256 and all 197 files; parsed baseline_v2 on the Pi. Target is QNX 8 / Raspberry Pi 5 / Python 3.14; numpy, cv2 and mediapipe are absent, so transfer is complete but live inference is not running. No secrets copied or application services started.

2026-10-18 | Installed QNX native CV packages, added a Sensor Framework camera adapter and verified local inference on camera unit 5 (~9 fps, hand detected). Built and transferred the production frontend, started its local server and verified local HTML plus live API access. Epiphany needs to launch from the active VNC session; the SSH environment has no display/D-Bus.

2026-10-18 | Checked direct Epiphany launch and QNX browser packages for the VNC request. The installed Epiphany exits with `cannot open display`; the QNX image has no X display and the package repo has no QNX Screen browser. The Pi-hosted frontend remains available through SSH forwarding in a Mac browser, which does not render inside the VNC desktop.
