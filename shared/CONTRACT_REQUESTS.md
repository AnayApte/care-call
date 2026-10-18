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

2026-10-17 | josh | Josh requested navigation from the patient screen to caregiver reports. Added a visible link to /caregiver during setup and regular use. Patient page and styling edits are authorized for this request.

2026-10-17 | josh | Josh requested hand-controlled Yes/No feedback. Added fixed thumbs-up/down detection while that prompt is open, with a one-second hold and release first. Patient hook, page and styling edits are authorized. Buttons, request learning and CREAO approval stay separate. No API changes or new libraries.

2026-10-17 | josh | Josh identified that patient thumbs could be mistaken for caregiver answers. Removed shared-camera thumb input and kept explicit caregiver buttons. A separate caregiver camera flow needs its own review context; handedness is not identity.

2026-10-18 | josh | Josh requested a separate 2.0 implementation contract and software-first validation while hardware teammates are away. Added shared/contract-v2.md and linked it from AGENTS.md and CLAUDE.md. V2 governs this completion phase, preserves ownership and defines planned additive APIs, optional caregiver feedback and separate software/hardware checks. The original contract and fixtures are unchanged.
2026-10-18 | josh | Josh asked to build the 2.0 software contract and push to his own branch. This authorizes the patient/caregiver web and server additions described in v2 for this branch. Hardware, the original contract and fixtures stay unchanged. No new libraries.
2026-10-18 | rey | Custom words, Josh part (web/src/cv/): let the personal kNN vote over the labels actually present in the samples instead of the fixed LABELS list, and accept any label matching /^[a-z][a-z0-9_]{0,23}$/ (still never firing on "neutral"). Keep Label = string at the boundary; water/pain/help/bathroom stay the defaults | Rey is adding an "Add a word" button after onboarding: caregiver types a word, patient trains 15 samples, word joins the deck. Today types.ts LABELS, isLabel and personal.ts nearest() reject or ignore any new label.
2026-10-18 | rey | Custom words, Anay part (server/): add POST /api/patients/{id}/vocabulary {label, display, speech} -> updated Patient (409 if label exists or is "neutral", same label regex as above), persisted in SQLite so it survives a restart; GET /api/patients/{id} returns it in vocabulary. POST /api/requests already validates against vocabulary, so nothing else changes | Same feature. PATIENT["vocabulary"] in models.py is an in-memory constant and there is no endpoint to add to it, so a custom word gets 422 when it fires.
2026-10-18 | rey | Done: custom words implemented across web/src/cv (types.ts, personal.ts) and server (vocabulary table + POST /api/patients/{id}/vocabulary) with owners' OK; see shared/changelog/rey.md. Contract section 8/9 should list the new endpoint and label rule.
2026-10-18 | josh | Josh requested live usage and the CREAO connection. Added PUT /api/patients/{id}/live-session and GET /api/patients/{id}/usage for ongoing counts; closed reports keep their retry rules. Explicit CREAO reviews read the latest saved or ongoing windows. Web/server edits are included for this request; no new libraries or automatic agent runs.

2026-10-18 | josh | Josh requested plain caregiver text without Maria or the slogan. Updated the dashboard, request inbox and report labels for this request.

2026-10-18 | josh | Josh requested a dashboard redesign inspired by Hello from Here. Updated the caregiver layout, request history and report styling on josh/dashboard-design. This request authorizes these web edits.

2026-10-18 | josh | Josh also requested matching patient fonts and buttons, with Caregiver screen at the top. Added patient styling and grouped its controls; camera and gesture logic are unchanged.

2026-10-18 | alex | Alex requested running the transferred CV model on the QNX Pi. Use the target's native python3-numpy, python3-opencv and python3-mediapipe-cpu packages, with their dependencies, in a system-site-packages venv; add QNX camera/inference glue only under edge/bedside. This extends the software-only v2 phase for the explicitly requested hardware work; preserve the baseline weights and web CV code.
2026-10-18 | alex | Native camera adapter build also needs qnx-sf-base-dev and qnx-screen-dev headers for the target's existing libcamapi; no additional runtime framework or model training is introduced.
2026-10-18 | alex | Add a local `/camera.mjpg` endpoint to the Pi-hosted frontend server, capturing only QNX USB camera unit 5, and let the patient app use that stream as an input source | The tunneled page runs in a Mac browser, whose getUserMedia can only access Mac cameras; v2 currently excludes video streaming, and web camera integration is owned by Rey.
