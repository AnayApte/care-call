# Status: Josh

Updated: 2026-10-17

Works:
- Step 4 is merged into main in PR #12.
- Step 5 is connected on josh/session-adaptation: usage reports and approved settings.
- Failed reports are retained for retry. Settings apply between holds.
- Selective Pain retraining kept all 60 other examples and survived refresh.
- Per-label limits, report versions and retraining completion have automated checks.
- Live approved-setting updates and Help-only retraining passed in browser simulation.
- Includes Rey's PR #18 feedback: keeps different styles and records "Nothing" without training neutral.
- Added the server CREAO adapter and caregiver report with explicit Apply and Dismiss on josh/creao-approval.
- Refresh resumes the same review. Outdated suggestions cannot overwrite newer settings.
- Simulated browser checks confirmed Dismiss saves nothing and Apply saves the shown settings.
- 50 JavaScript tests, 15 server checks, TypeScript and the web build pass.
- Earlier guided arm demo and browser beacon preview remain available.

Next:
- Finish CREAO email verification, create the agent and set its key privately. No live run verified yet.
- Review the CREAO changes after Step 5 PR #15. Setup: docs/josh-creao.md.
- Test real camera movements together.
- Alex: test the caregiver Pi against the same server, including its buzzer and display.
- Anay: update the shared plan for Josh's new goal and agree a richer observation format.
- Anay: add session deduplication and atomic per-label sample replacement.

Arm thresholds are unvalidated demo settings. This cannot diagnose or rule out stroke.
Physical hardware has not been verified. The earlier gesture demo remains available.
