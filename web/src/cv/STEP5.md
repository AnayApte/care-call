# Step 5: approved adjustments

- Counts completed and abandoned gesture holds, including confidence drops.
- Sends usage reports every ten minutes and when the page hides or closes.
- Keeps failed reports for retry, using browser storage when available.
- Reads approved settings at startup and every 30 seconds. Applies changes between holds.
- Limits holds to 6–30 observations and confidence to 0.6–0.95.
- Re-records only requested movements. Other movements stay available afterward.
- Remembers completed retraining for that configuration on this browser.

`sessionReporter.ts` handles delivery. `adapt.ts` checks settings. `retraining.ts`
selects movements and remembers completion. The patient hook connects them.
Only counts and scores go into usage reports, not images or hand coordinates.

The patient page keeps Rey's countdown, smooth hand display, feedback and
tap-to-dismiss result. Feedback also supplies explicit corrections for reports.
It uses Josh's configurable trigger at up to 12 observations per second,
so approved hold settings keep the units in the shared contract. Rey's separate
time-based trigger is unchanged.

Josh was asked to finish the CREAO adapter and caregiver approval screen.
Open `/caregiver` to review and explicitly Apply or Dismiss a suggestion.
Setup: [CREAO connection](../../../docs/josh-creao.md).
The patient code reads approved settings; it never applies an unapproved proposal.
Confusions and false-neutral counts require explicit corrections. Predictions
alone cannot tell us what the person meant.

Run JavaScript checks using the commands in `GESTURES.md`.
Run `python web/src/cv/adaptServer.test.py` for the three local API checks.
Tests use synthetic inputs and a temporary database; no external agent is called.

Follow-up for Anay: add server deduplication for retried reports and atomic
per-label sample replacement. A lost HTTP reply can currently cause a duplicate
report. Stored examples remain history. Rey's sample helper keeps up to 60 per
label and removes near-duplicates first, preserving different styles. Feedback
adds at most five spread-out examples. "Nothing" counts as a false trigger in
the report and does not train neutral. Requested re-recording replaces that
label's active examples on this page.
