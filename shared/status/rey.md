# Status: rey

Updated: 2026-10-17 16:15

Works:
- `ml/`: HaGRIDv2 landmark baseline v2. 1.05M train hands, 95.2% on 34 classes, user-disjoint.
  Embedding beats raw landmarks for 15-shot personal kNN, including on 5 gestures held out of
  training (98.5% vs 96.1%). `baseline.json` + `test_vectors.json` ready for a JS port.
- `ml/camera_test.py` live two-hand webcam check.

Blocked / need:
- Browser integration needs Josh (`web/src/cv/`) and a contract line: our normalisation
  (`wrist_relative_v1`) differs from s8. Not requested yet; testing first.
- Augmentation unproven on impaired hands; needs the 9 PM simulated-impairment data.

Next:
- Two-hand 66-float feature (see `docs/ml-gestures.md`), then web pages per agents/rey.md.
