# CREAO review and Apply

The server exists. This adds its CREAO connection and the `/caregiver` review screen.

1. Create the agent with [these instructions](josh-creao-agent.md).
2. In CREAO, enable API Trigger and copy the agent/app ID. Create an app-scoped API key.
3. Set `CREAO_AGENT_ID`, `CREAO_API_KEY` and `ENABLE_CREAO=true` privately in
   `server/.env` or Railway. Restart the server. Never put the key in the web app.
4. Open `/caregiver`. Click **Ask CREAO to review**. Read its explanation and
   compare the settings. **Apply** saves them; **Dismiss** leaves them alone.
5. The patient screen loads approved settings within 30 seconds, between holds.
   Only requested movements need recording again. Other examples stay saved.

The agent receives the latest five session summaries and recent feedback.
It receives no camera images or hand vectors. Use synthetic demo data for the demo.
The reports save every ten minutes and when leaving the patient screen.

Missing setup or a failed run shows an error. The app never invents a report.
Refresh resumes the same saved run. An outdated suggestion cannot overwrite
newer settings. Dismiss stops waiting locally; it does not cancel a CREAO run.

Official API docs: [API Trigger](https://docs.creao.ai/pro/api-trigger),
[account API](https://docs.creao.ai/developer-api/runs/create-async-run).
Both `capi_` app keys and `cr_sk_` account keys are supported.

Checks: run `python server/tests/test_creao.py` with server dependencies installed,
plus the web build and `approval.test.cjs` using the CV test setup. Include
`web/src/lib/adaptation.ts` when compiling those JavaScript tests.
A simulated test does not count as a live CREAO run or sponsor evidence.
