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
