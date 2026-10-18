# Contract change requests (append one line, never edit others' lines)

Format: `YYYY-MM-DD HH:MM | name | what you need changed | why`

2026-10-17 15:39 | josh | Please record Josh's requested working split while Rey handles model training: Josh owns landmarks/features/capture/trigger; classifier boundary is Predictor in web/src/cv/types.ts (42 wrist-max-2D x/y values -> label/confidence or null), page wiring/request API stays with Rey; confirm MediaPipe npm/WASM version and session delivery/retry ownership | Avoid duplicate classifier work and make cross-folder integration explicit; implementation notes in web/src/cv/README.md.

2026-10-17 15:53 | josh | Rey's baseline is on main; please record browser personal kNN using its 32D embeddings via toModelFeatures adapter (middle-MCP scaling + x canonicalization), while stored/wire samples remain max-distance 42D vectors per section 8 | Integrates the completed model without changing shared data or editing ml/; baseline class names never directly map to care requests. Personal labels are learned from captures. See web/src/cv/README.md.

2026-10-17 16:19 | josh | Josh changed his goal to observing stroke warning signs. Added an unvalidated guided arm-drop demo in his folder; it sends generic HELP through the existing API. Please update the shared plan and agree an observation payload; the confidence field currently holds pose visibility, never stroke probability. Alex owns real ESP32 testing. No diagnosis or all-clear claim.
2026-10-17 19:05 | rey | Trigger min confidence 0.8 feels too strict with real hands in testing; propose 0.7 and a time-based 1 s hold with gentle drain instead of 12 consecutive frames | detection now runs at 30 fps so 12 frames is only 0.4 s, and one odd frame should not wipe the ring

2026-10-17 | josh | Josh asked to complete step 4. Connected his CV code to Rey's patient page on josh/patient-integration; small bridge, onboarding and status-message edits are included for review. Camera runs at 12 fps with the current contract's hold and confidence settings. No server, hardware or model weights changed.

2026-10-17 | josh | Step 5 connects reports, approved settings and selective retraining through the patient hook. Keeps Rey's PR #13 UI and PR #14 feedback; explicit corrections enter reports. The patient page uses Josh's configurable contract trigger at up to 12 observations/sec while the camera stays smooth. Rey's time-based trigger is unchanged. Please add idempotent session ingestion and atomic per-label sample replacement; the current API can duplicate a report after a lost reply and retains old examples. No server or agent code changed by Josh.

2026-10-17 | josh | Josh asked to finish CREAO and caregiver Apply. Added GET /api/adapt/setup (ready only), GET /api/patients/{id}/sessions (latest five), base_config in the run response, and optional expected_version on the settings PUT to reject outdated approval atomically. Server and caregiver edits are authorized for this request. Shared contract and fixtures are unchanged.

2026-10-17 | josh | Josh requested a small report popup and a separate detailed route. Added /caregiver/reports/{run-id}, with Apply/Dismiss on that page. Completed reports and their approval context are saved in this browser; direct links without that context are read-only. No API changes or new libraries.
