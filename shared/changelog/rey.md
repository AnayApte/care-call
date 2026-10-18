# Changelog: rey

(append entries: time, what changed, why)
- 2026-10-17 15:30  ml: prepare/train/embed/camera_test pipeline, baseline v1 (94.9%, 55k hands).
- 2026-10-17 16:10  ml: v2. All data (1.05M hands), LR decay + early stop that actually fires,
  augmentation (`augment.py`), `--holdout` transfer test (`fewshot.py`). Found and fixed a
  wrist-jitter bug that collapsed training. Notes in `ml/experiments.md`, design in
  `docs/ml-gestures.md`.
- 2026-10-17 17:25 | web/mockups: three onboarding mockup variations (A1 paper tag, A2 bottom sheet, A3 typographic), decisions recorded in status. Static HTML only, no app code yet.
- 2026-10-17 17:45 | web: scaffold (Vite 5, React, TS, Tailwind v4, shadcn, tokens), /patient onboarding flow from mockup A1, mock gesture layer behind an adapter, tested against the local server.
