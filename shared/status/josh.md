# Status: Josh

Updated: 2026-10-18

Works:
- Step 4 is merged into main in PR #12.
- Step 5, CREAO review and the report pages are merged into main through PR #15.
- Failed reports are retained for retry. Settings apply between holds.
- Selective Pain retraining kept all 60 other examples and survived refresh.
- Per-label limits, report versions and retraining completion have automated checks.
- Live approved-setting updates and Help-only retraining passed in browser simulation.
- Includes Rey's PR #18 feedback: keeps different styles and records "Nothing" without training neutral.
- Added the server CREAO adapter and caregiver report with explicit Apply and Dismiss.
- Refresh resumes the same review. Outdated suggestions cannot overwrite newer settings.
- Simulated browser checks confirmed Dismiss saves nothing and Apply saves the shown settings.
- CREAO agent created and connected locally with a private, agent-scoped key.
- Real API run on four synthetic sessions reached the caregiver screen; explicit Apply saved Pain-only retraining.
- Added a small summary popup and a readable full-report route.
- Patient screen has a visible Caregiver reports link during setup and regular use.
- Caregiver feedback uses buttons. Patient camera gestures cannot answer the caregiver's Yes/No check.
- Removed shared-camera thumb feedback because it cannot tell the patient from the caregiver.
- Reports survive refresh and Apply/Dismiss. Direct links without approval context are read-only.
- Kept Rey's two-hand tracking and camera picker from PR #22 alongside Step 5.
- 64 JavaScript tests, 16 server checks, TypeScript and the web build pass.
- Earlier guided arm demo and browser beacon preview remain available.

Next:
- Follow shared/contract-v2.md: finish the real-camera/browser-caregiver request loop before the next hardware session.
- V2 adds owners, planned API extensions and unchecked software/hardware acceptance lists. This documentation does not implement them.
- Set CREAO variables privately on the deployed server; local keys are not pushed through Git.
- Test real camera movements together.
- Alex: test the caregiver Pi against the same server, including its buzzer and display.
- Anay: add session deduplication and atomic per-label sample replacement.

Arm thresholds are unvalidated demo settings. This cannot diagnose or rule out stroke.
Physical hardware has not been verified. The earlier gesture demo remains available.

## Software 2.0 branch

Branch: josh/software-v2. Josh authorized the v2 web/server work; hardware is unchanged.

Built: exact-request acknowledgement, patient speech and automatic return after rest,
live caregiver inbox, browser beacon, optional feedback, retry keys and complete-label saves.
Existing CREAO reports and explicit approval remain separate from sending help.

Checks so far: 60 CV checks, 19 server checks, typecheck, changed-file lint and production build pass.
These are automated/synthetic checks. Browser integration, real gestures, real voice playback,
deployed CREAO and physical board checks are recorded separately; do not call them passed yet.

Verified on 2026-10-18, code commit 8bc8221:
- 61 CV checks, 11 hand-selection checks and 24 API checks pass (96 total).
- Production build and typecheck pass. Lint has no errors; one existing button warning remains.
- Local browser check: frontend 5180, isolated backend 8006, synthetic Maria recordings.
  Water reached caregiver and beacon, exact-ID acknowledgement returned to the patient,
  rest restored listening, and refresh recovered a pending request. Not sure sent no vote.
- Voice selected the clearly labeled browser fallback in this test. No live CREAO,
  messages or calls were started. Real ElevenLabs playback was not verified here.
- Feedback now updates history; guided recording changes personal samples. No remote
  correction silently teaches the model.

Still needed: fresh real-camera trials and accuracy counts, the chosen deployed server's
CREAO check, and Alex's real Pi checks. The v2 real-camera/hardware boxes remain unchecked.

Camera preview fix (2026-10-18): moved the shading off the live video into a separate
layer. The local patient page at port 5181 shows live video again; Josh confirmed
his image and the hand dots are visible. This verifies the preview and tracking,
not gesture accuracy or a complete request cycle. Typecheck and production build pass.

Live usage update (2026-10-18): patient counts publish every two seconds; the
caregiver page checks every three seconds. Ongoing and saved reports count once.
Verified on ports 5181/8007: the open caregiver page changed from 4 attempts / 2
requests to 5 / 3, including an ongoing session, without Refresh.
Restarted the same local server with CREAO enabled and the existing private key.
The review button is enabled. No new paid run was started; this is a setup check.
Synced Rey's custom-word update from main; usage includes added words too.
64 CV checks, 15 hand/word checks, 26 server checks, typecheck, changed-file lint
and build pass.

Caregiver text (2026-10-18): replaced the slogan with "Caregiver dashboard" and
hard-coded Maria labels with "patient" or "demo profile", including report views.
Verified the dashboard and popup in the browser. Typecheck, changed-file lint and build pass.

Dashboard design (2026-10-18): black grid, white type and a geometric header inspired
by the [Hello from Here archive](https://www.awwwards.com/sites/hello-from-here).
Waiting requests get a compact header and prominent acknowledgement button.
Answered requests expand in history. The popup and detailed report share the style.
Checked browser layouts at 390px, 768px and desktop, history and report navigation.
Matched patient buttons, type, training cards and feedback. Caregiver screen is now
at the top right. Live camera still shows; narrow training and form styles checked
with a temporary preview that sends no requests or recordings.
Typecheck, changed-file lint and production build pass.

Beacon branding (2026-10-18): added a lighthouse mark from Josh's reference to the
patient, caregiver, report and fallback headers, plus the browser icon and title.
Removed website sound controls, training beeps and browser speech. External speaker
code is unchanged. 65 CV checks, typecheck, changed-file lint and build pass.
The silent request/acknowledgement cycle has an automated check. Live caregiver
branding checked. Training-save investigation is next; no recordings were reset.
