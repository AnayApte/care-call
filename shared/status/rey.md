# Status: rey

Updated: 2026-10-17 ~5:25 PM

Works:
- Branch `rey/onboarding-ui`. Three static HTML mockups of the /patient onboarding (training) flow in `web/mockups/` (open `index.html`, or `<page>.html?frame=N` for one frame at 1280x800). Warm clinical direction, three variations: paper tag, bottom sheet, typographic.
- Decisions locked with Rey: caregiver-voice prompts, tap Start then 3-2-1 countdown then automatic 3 s hold gated on loose steadiness, auto-retry on hand loss, check sound per label, no summary screen, straight into listening, samples saved per label, visible Retrain button resets.

Blocked / need:
- Rey to pick a variation (or mix) before the React build starts.

Next:
- Scaffold Vite 5 + React + TS + Tailwind v4 in `web/`, build /patient onboarding against Josh's `web/src/cv/` interface and the fixtures, then /caregiver and /beacon.
