# Care Call 2.0: finish the software, then connect the hardware

Requested by Josh on 2026-10-18. This is an implementation plan, not a claim that the work below is done.

Read [contract.md](contract.md) first. This document governs the completion phase:
the flow, additions and acceptance checks below take precedence where they differ
from v1. Keep v1's stack, labels, feature format, ownership and secret handling.
The original contract and fixtures remain unchanged.

## 1. Goal and scope

Use the computer's own camera and speaker to finish the complete software flow.
A second browser tab acts as the caregiver device. A phone can join later through
the deployed web app and the same server. Hardware availability must not block this work.

Care Call learns a person's movements and turns them into requests for Water,
Pain, Help or Bathroom. Neutral means rest. It is an assistive prototype, not a
medical device or stroke detector. Use Maria and teammates simulating limited dexterity.

Pi gesture recognition, new models, video streaming and face input are outside this phase.
Physical buzzer, LCD, button and bedside speaker checks belong to the next hardware session.
Passing the browser checks means software-ready, not hardware-verified.

## 2. Starting point

Main includes PR #15 and the work folded into it from #21, #25 and #26:
personal training, request creation, usage reports, approved settings, selective
retraining, the report popup and the full report page. A real CREAO run and Apply
were verified locally on synthetic data. Preserve these pieces.

Still to finish: spoken requests, patient acknowledgement handling, hands-free
return to listening, caregiver live requests, the beacon fallback and storage fixes.
The checks below start unchecked. Record new evidence instead of assuming earlier tests cover them.

## 3. Build order and owners

| Order | Owner | Deliverable |
| --- | --- | --- |
| S1 | Josh + Rey | Patient request lifecycle, speech and release before listening again |
| S1 | Rey | Caregiver live inbox, exact-request acknowledgement and browser beacon |
| S1 | Anay | Exact-request reads and reliable request creation/acknowledgement |
| S2 | Rey + Anay | Optional caregiver correctness feedback saved against a request |
| S2 | Anay + Josh | Report deduplication and atomic per-label retraining |
| S2 | Rey + Josh + Anay | Verify the existing CREAO review and Apply flow against the chosen server |
| S2 | Josh + Rey | Fresh camera trials and recorded results |
| H1 | Alex + team | Replace browser stand-ins with the real Pis and repeat the checks |

Keep existing folder ownership: Josh owns `web/src/cv/` and `benchmark/`; Rey owns
the rest of `web/` and his server integrations; Anay owns server core; Alex owns
`edge/`. Coordinate edits to the patient hook with Rey. Use small feature branches
from current main and separate PRs. This plan does not change the freeze schedule.

## 4. Local setup

- Use one local FastAPI server and one persistent test database. Point both browser roles at it with `VITE_API_BASE`.
- Open `/patient` with the real built-in camera. Open `/caregiver` separately; `/beacon` must also be testable as a fallback.
- Enable camera and sound once during setup. Handle denied permission, unavailable cameras and blocked audio with clear controls.
- Keep `ENABLE_PHOTON=false` and `ENABLE_PHONE_CALL=false` locally. Do not start a second Photon bridge.
- Keep agent runs off during repeatable tests. Simulated outputs must be labeled; a live CREAO run needs an explicit operator action.
- Use the existing setup in [Anay's server guide](../docs/anay-server.md) and [CREAO guide](../docs/josh-creao.md). Keep keys server-side.

## 5. Patient flow: no touch needed after setup

1. Record 15 examples over a three-second hold for each of the four requests and Neutral. Saved training survives refresh.
2. Hold a learned request until the ring fills. Keep the current approved thresholds: defaults are 12 observations at 0.8 confidence, sampled at up to 12 observations/second, with an eight-second cooldown.
3. Create one request. Say "Request sent" only after the server accepts it. Play its spoken phrase once through the computer speaker.
4. Show the pending word and poll that request's ID every second. Do not substitute the newest request or infer an acknowledgement from a timer.
5. When that ID is acknowledged, show and speak "Help is coming" once. Keep it visible for five seconds.
6. Return to listening automatically after a clear release/rest lasting at least half a second and the remaining cooldown. A held request pose must not fire again after acknowledgement.

Suggested states: `ready -> sending -> waiting_ack -> acknowledged -> waiting_release -> ready`.
An uncertain HTTP result uses `delivery_unknown`; a known rejection uses `failed`.
Never turn an error into "sent" or "acknowledged". Retrying an uncertain submission must reuse its saved request key.

While waiting for an acknowledgement, keep one active request from this patient screen.
Correctness feedback must not pause or gate this cycle. Keep a manual recovery control,
but it must not be needed in the successful path. Backgrounded or stalled camera frames
do not count toward a hold or release. After refresh, recover a saved pending request
and require a fresh release before listening again. Speech must not replay on every poll.

Use cached ElevenLabs audio through `/api/tts`. If it is unavailable, a clearly labeled
browser-voice fallback may keep the local demo usable; this does not count as ElevenLabs evidence.
If speech is blocked, keep the request visible and show how to enable sound.

## 6. Caregiver flow: acknowledge first, optional feedback later

`/caregiver` shows live open requests, their time, connection status and an **I'm coming**
button. Poll every second. Keep the existing report summary and detailed report links.
An acknowledgement answers the displayed request ID, stops its alert and shows its answered state.
Refresh must not replay old alerts. Show stale/offline status when polling fails.

Finish `/beacon` with the same request IDs and states: large word, red alert, sound
enabled by an initial tap, large acknowledgement button and green answered state.
It is a browser stand-in for the caregiver Pi, not evidence of a real Pi heartbeat.
Do not embed the production device token in frontend code; use the existing public
request-list and dashboard-ack routes for the browser stand-in.

Correctness feedback is separate from **I'm coming** and CREAO **Apply**:

- **Correct:** the caregiver knows the app understood the request.
- **Incorrect:** the caregiver knows it was wrong; record the intended word when known. "Nothing intended" is an explicit false trigger.
- **Not sure:** postpone feedback. Send no correctness vote and make no training change.

An absent caregiver cannot infer intent from the predicted word alone. Never require
feedback before sending help. Put remote feedback on the caregiver request card;
local assisted-setup feedback can remain optional. Patient-camera thumbs are not caregiver approval.

Verified remote feedback feeds the stored history and CREAO. Do not update personal
kNN from a remote correction unless the original request examples are linked and
validated. Until then, use guided retraining. Never learn from an acknowledgement,
an unknown answer or the caregiver's hand.

## 7. Planned API additions

These are requirements to implement, not endpoints already supplied by this document.
Anay owns server changes; old clients must continue to work during the transition.
Keep existing Request fields, 42-number stored samples and error response shapes.

| Interface | Required behaviour |
| --- | --- |
| `POST /api/requests` | Add optional `client_request_id`. New browser clients persist and reuse it for retries. Same patient/key and same payload returns the original Request; conflicting reuse returns 409. |
| `GET /api/requests/{id}` | Return that Request or 404, so the patient can track its own acknowledgement. |
| `POST /api/requests/{id}/ack` | Keep `{by:"dashboard"}`. Repeated acknowledgement returns the already answered request without repeating alerts or speech. |
| `POST /api/device/ack` | Add optional `request_id`; updated device clients send the displayed ID. Never replace a supplied ID with the latest request. Unknown ID returns 404; repeated acknowledgement is harmless. Legacy `{device_id}` remains supported until Alex updates the scripts. |
| `POST /api/requests/{id}/feedback` | Keep `{correct:boolean}`; add optional `intended_label` from the existing labels. `neutral` means "nothing intended" and does not train Neutral. Missing intended meaning stays unknown. A correct vote cannot name a different intended word. Keep one current vote per request so retries do not multiply it. |
| `POST /api/cv/sessions` | Add `session_id`, generated once and retained with the queued report. Deduplicate by patient/session ID; return the original record on a retry. Legacy reports remain readable. |
| `PUT /api/patients/{id}/samples/{label}` | Accept `{vectors:[...]}` with exactly 15 finite, 42-number vectors. Validate the complete batch before replacing that label in one transaction. Return the saved Sample list. Other labels stay untouched. Keep existing sample routes for older clients. |

Add database migrations without deleting existing samples, requests or sessions.
Unknown feedback stays out of accuracy and confusion counts. Per-label retraining
is complete only after the whole batch is saved; failed uploads remain retryable.

## 8. CREAO and report rules

Preserve the existing popup, detailed route, explicit Apply/Dismiss, bounded settings
and version guard. Run the agent between sessions. It never blocks request delivery
or applies settings on its own. Approved changes load within 30 seconds, between holds.
Only requested labels are re-recorded.

Verify the chosen server's readiness before a live test. Reopening a completed report
must reuse that run. Browser-local report storage and read-only links without their
original approval context remain acceptable for this prototype; document that limit.
Use a report started from the caregiver's own browser to verify approval there.
Simulated runs and browser speech fallbacks must not be presented as live sponsor integrations.

## 9. Software acceptance checklist

Use real camera input for camera checks and synthetic Maria data for reports.
For each item, record the commit, server, expected/actual result and evidence in `shared/status/<name>.md`.

- [ ] Three Water cycles in succession: fresh movement -> spoken request -> caregiver browser alert -> acknowledgement -> spoken confirmation -> listening again, without touching the patient screen.
- [ ] One fresh successful cycle each for Pain, Help and Bathroom.
- [ ] A minute of visible Neutral produces no request. Holding the old pose through acknowledgement produces no second request.
- [ ] Camera loss, hidden tab and server loss never invent a request or acknowledgement; recovery needs a fresh release.
- [ ] A lost submission reply and retry create one request. A duplicated report creates one session record.
- [ ] Two requests arriving close together cannot make the caregiver answer a different ID from the displayed one.
- [ ] Refresh during a pending request recovers it. Repeated polls and acknowledgements do not repeat speech or alerts.
- [ ] Saved training reloads; targeted retraining replaces only that label and survives another refresh.
- [ ] Correct/Incorrect feedback is optional; Not sure and acknowledgement never teach the model or count as correctness.
- [ ] The beacon fallback completes the same alert/acknowledgement flow without device secrets in the web bundle.
- [ ] A labeled simulated report exercises popup, full report, Apply, Dismiss and stale-version rejection. Reopening it starts no new agent run.
- [ ] One explicitly started real CREAO run on synthetic sessions works against the chosen server, including approved settings and selective retraining. Reuse existing verified evidence where applicable; record its server/commit limits.
- [ ] Fresh gesture trials record successes, misses, false triggers and time to acknowledgement separately from training accuracy. Benchmark comparisons use held-out examples and disclose simulated limited dexterity.

Passing S1 proves the request loop. Software completion requires the S2 checks too.
Physical integration and deployment are separate results; do not mark them passed from local browser tests.

## 10. Next hardware session

Hand Alex the tested commit, server URL, device IDs, API changes and the software checklist.
Transfer device credentials privately. Browser roles and Pis must point to the same
server; `localhost` on a Pi is not the laptop. Keep one designated bedside audio
player so the browser and Pi do not both speak the same acknowledgement.

Alex updates exact-ID acknowledgement, starts both Pi scripts and checks heartbeats.
Repeat three Water cycles using the real LCD, buzzer, button and speaker, then test
disconnection/reconnection. Run separate, explicitly arranged iMessage and phone
tests with the intended demo recipient. Keep those results separate from local tests.

No core request-flow redesign should be needed when the hardware arrives.
