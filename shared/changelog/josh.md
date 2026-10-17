# Changelog: josh

(append entries: time, what changed, why)

2026-10-17 15:39 America/Los_Angeles | Added camera/features/sample capture, classifier plug-in types, trigger engine + React hook, adaptation/session helpers, standalone camera demo and integration notes. Kept work in Josh-owned files; no duplicate classifier while Rey trains his model. Strict typecheck, Vite 5 build, 11 core tests and initial browser page-load check passed. Live hand capture and full team integration remain to verify.

2026-10-17 15:53 America/Los_Angeles | On josh/model-integration, integrated Rey's completed model from main without modifying ml/. Added JS dense-layer inference, wrist_relative_v1 adapter, personal kNN over 32D embeddings and functional local training/request demo. Kept contract samples in max-distance 42D format. All 18 tests/typecheck/Vite 5 build pass; reference parity max error 9.54e-7. Real webcam and backend handoff remain manual/integration checks.

2026-10-17 | Shortened the README and status notes to make setup and next steps easier to follow.

2026-10-17 16:19 | Added guided arm movement demo, HELP alert, device status and browser acknowledgement preview for Josh's updated goal. Simulated flow and 31 checks passed. Live camera and real hardware still need testing.
