# Changelog: alex

(append entries: time, what changed, why)

2026-10-18 | Pulled main to 80dd366 and prepared an inference-only transfer archive in /tmp from existing ml files. Inspected current model and hardware handoff; awaiting bedside Pi SSH address and OS before transfer. No model weights or other owners' source files changed; Pi execution remains unverified.

2026-10-18 | Transferred project snapshot 32cb92c, including ml/baseline.json and all tracked CV code, to qnxuser@172.20.10.2:/data/home/qnxuser/care-call. Verified archive SHA256 and all 197 files; parsed baseline_v2 on the Pi. Target is QNX 8 / Raspberry Pi 5 / Python 3.14; numpy, cv2 and mediapipe are absent, so transfer is complete but live inference is not running. No secrets copied or application services started.
