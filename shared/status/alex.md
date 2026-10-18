# Status: alex

Updated: 2026-10-18

Works:
- Pulled origin/main from 1976f36 to 80dd366 without conflicts.
- Prepared /tmp/care-call-pi-vision-80dd366.tar.gz with the existing baseline model, NumPy inference, normalization, camera demo and reference vectors. Archive contents checked; no credentials or training datasets included.

Blocked / need:
- Need the target bedside Pi SSH address and OS/architecture before transferring and selecting compatible runtime dependencies. The documented 172.20.10.2 address is for the caregiver Pi, not a confirmed bedside target.
- No Pi transfer, dependency installation or hardware inference has been verified.

Next:
- Inspect the confirmed Pi, transfer the archive, compare checksums, and run model reference checks and a camera smoke test.
- The existing camera_test.py uses a GUI and needs ml/data created before its model download. Baseline inference alone does not provide personalized request recognition; that also requires saved samples, kNN and request lifecycle handling.
