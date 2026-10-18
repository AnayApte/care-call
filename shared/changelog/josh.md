# Changelog: josh

(append entries: time, what changed, why)

2026-10-17 15:39 America/Los_Angeles | Added camera/features/sample capture, classifier plug-in types, trigger engine + React hook, adaptation/session helpers, standalone camera demo and integration notes. Kept work in Josh-owned files; no duplicate classifier while Rey trains his model. Strict typecheck, Vite 5 build, 11 core tests and initial browser page-load check passed. Live hand capture and full team integration remain to verify.

2026-10-17 15:53 America/Los_Angeles | On josh/model-integration, integrated Rey's completed model from main without modifying ml/. Added JS dense-layer inference, wrist_relative_v1 adapter, personal kNN over 32D embeddings and functional local training/request demo. Kept contract samples in max-distance 42D format. All 18 tests/typecheck/Vite 5 build pass; reference parity max error 9.54e-7. Real webcam and backend handoff remain manual/integration checks.

2026-10-17 | Shortened the README and status notes to make setup and next steps easier to follow.

2026-10-17 16:19 | Added guided arm movement demo, HELP alert, device status and browser acknowledgement preview for Josh's updated goal. Simulated flow and 31 checks passed. Live camera and real hardware still need testing.

2026-10-17 | Clarified that the real ESP32 needs the public server URL; localhost is only for laptop testing.

2026-10-17 | Pulled Rey's larger version 2 model, checked browser compatibility and added a model version label. All 29 JavaScript tests pass. Arm check unchanged.

2026-10-17 | Connected step 4 to Rey's patient screen. Added real gesture recognition, training check and honest send status. Simulated training, Water request, device alert and failed send checked. 33 JavaScript tests, two server checks and web build pass. Live camera and hardware still need testing.

2026-10-17 | Synced with main before merging step 4. Updated device wording for the team's switch to Raspberry Pi. Server alert checks still pass.

2026-10-17 | Connected Step 5 reports, approved settings and selective retraining. Reports retry after failure; settings stay bounded and wait for a hold to finish. Selective retraining kept the other movements intact. Live CREAO setup remains Rey's part.

2026-10-17 | Resolved Step 5 conflicts with main. Kept Rey's gentler feedback and different movement styles. "Nothing" enters reports without teaching neutral.

2026-10-17 | Josh asked to finish the CREAO connection and Apply screen. Added the server adapter, recent reports, review comparison and explicit approval. Dismiss leaves settings alone; stale Apply is rejected. 50 JavaScript and 15 server checks pass, plus build and typecheck. Browser flow passed with a labeled simulation. Live CREAO agent and key still need setup.

2026-10-17 | Created the CREAO agent and, with Josh's approval, saved its key privately. A real API run returned the full proposal in chatText, so the reader now validates that field too. The same completed run reached the caregiver screen; Apply saved Pain-only retraining in the separate demo database. 16 server checks pass. Deployed-server key setup remains.

2026-10-17 | Added a plain-English summary popup and a separate full-report page. Reports remain readable after refresh and approval; opening a link without its original settings is read-only. Popup, navigation, Dismiss and Apply passed browser checks without new CREAO runs. Kept Rey's PR #22 camera and hand changes while syncing Step 5. 64 JavaScript checks and web build pass.

2026-10-17 | Added Caregiver reports to the patient screen so the summary and full report are easy to find.

2026-10-17 | Added thumbs-up Yes and thumbs-down No to request feedback. Relax first, then hold for one second; the buttons still work. Nine thumb checks and three isolated frame/API flows passed, including learning from the original request rather than the thumb. Build, typecheck and lint pass with one existing warning. Real-camera testing remains.

2026-10-17 | Removed shared-camera thumb feedback after Josh identified the patient/caregiver overlap. The camera cannot establish who answered. Kept caregiver Yes/No buttons and made their role clear. Simulated patient thumbs leave the prompt unanswered; manual Yes/No and corrections still work. Build, typecheck and changed-file lint pass.

2026-10-18 | Added the 2.0 completion contract at Josh's request. Prioritizes the local camera, browser caregiver, hands-free request cycle and optional correctness feedback before hardware integration. Includes ownership, planned API changes and acceptance checklists. Updated agent entry points; original contract and fixtures are unchanged. Documentation only.

2026-10-18 | Built the 2.0 software request cycle on josh/software-v2. Added patient acknowledgement and speech, automatic listening after rest, caregiver live requests, browser beacon, optional feedback, duplicate protection and whole-label training saves. Automated checks pass; real-camera and board testing remain.

2026-10-18 | Verified the local browser request/acknowledgement flow with synthetic gestures. Added camera-pause recovery, held-pose protection after retraining and a malformed-reply check. All 96 automated checks and the build pass. Real-camera, live voice/CREAO and hardware checks remain separate.

2026-10-18 | Fixed the black camera preview by moving shading to a separate layer. Josh confirmed live video and hand dots on port 5181. Typecheck and build pass. Gesture accuracy and the full real-camera request cycle still need testing.

2026-10-18 | Added automatic usage updates, including ongoing practice and custom words. Saved reports do not double-count the live window. Browser counts updated without Refresh. Synced Rey's new words from main. Enabled the local server's existing CREAO setup; no paid run started. 105 checks, typecheck, lint and build pass.

2026-10-18 | Replaced the caregiver slogan with "Caregiver dashboard" and removed Maria from dashboard and report labels. Browser check, typecheck, lint and build pass.

2026-10-18 | Redesigned the caregiver dashboard with Hello from Here's black grid and geometric style. Waiting requests stay prominent; answered requests move into history. Matched reports and patient controls, with Caregiver screen at the top right. Live preview, phone/tablet styles and report navigation checked; typecheck, lint and build pass.

2026-10-18 | Renamed the web app Beacon and added a lighthouse logo. Removed browser audio and its controls so the external speaker handles sound. Kept saved data and device code unchanged. 65 CV checks, typecheck, lint and build pass. Training-save error still under investigation.
