# Experiments log (ml/)

All numbers on validation users never seen in training. Few-shot test = `fewshot.py`:
a new person records 15 samples per label, then a 5-NN classifies 200 more of theirs.
60 trials. Assistive prototype, not a medical device.

## 2026-10-17 16:05  baseline_v2: all data, longer schedule, augmentation, hold-out transfer

Changes from v1: no per-class cap (55k -> 1.05M train hands, 13k -> 51k users), batch 512,
up to 100 epochs with LR halving on plateau (v1 hit its 40-epoch cap without early stopping),
landmark augmentation (`augment.py`), `--holdout` option in `train.py`.

| model | train hands | val acc (34 classes) | epochs | time |
| --- | --- | --- | --- | --- |
| v1 (cap 2000, no aug) | 54,956 | 0.9489 | 40 (cap hit) | 9 s |
| v2 no aug (`--no-aug`) | 1,052,724 | 0.9514 | 53 | 70 s |
| v2 with aug (shipped `baseline.json`) | 1,052,724 | 0.9516 | 57 | 93 s |
| v2 hold-out 5 classes, aug | ~900k | 0.9490 (29 classes) | 53 | 58 s |

### Few-shot personal kNN, raw 42 landmarks vs 32-float embedding

| model | test classes | raw42 mean / worst | emb32 mean / worst |
| --- | --- | --- | --- |
| v1 | random 5 incl. neutral | 0.921 / 0.833 | 0.961 / 0.877 |
| v2 no aug | random 5 incl. neutral | 0.915 / 0.787 | 0.971 / 0.918 |
| v2 aug (shipped) | random 5 incl. neutral | 0.915 / 0.787 | 0.973 / 0.908 |
| **v2 hold-out** | **ok, peace, rock, call, neutral: never seen in training** | 0.961 / 0.941 | **0.985 / 0.974** |

### What this says

- **The embedding transfers to gestures it has never seen.** On five classes removed from
  training, the embedding kNN beats raw landmarks by 2.4 points on mean and 3.3 on the
  worst trial. This is the honest number for "will it work on Maria's own movements":
  the baseline never has to know the patient's gestures, only hands in general.
- **More data and a finished schedule helped a little** (0.949 -> 0.951 on 34 classes;
  few-shot worst case 0.877 -> 0.918). Most of the ceiling is near-duplicate HaGRID classes
  (`thumb_index` vs `thumb_index2`), which the product does not care about.
- **Augmentation is neutral on this data.** +0.0002 val, +0.002 few-shot mean, -0.01 worst trial.
  Kept on because its purpose is robustness to weak, shaky and partly closed hands, and HaGRID
  cannot measure that. The real test is the 9 PM simulated-impairment data (contract s18).
  If it does not help there, turn it off with `--no-aug`.
- **Bug found and fixed during this run:** the wrist is always (0, 0) after normalisation, so
  its standardisation std was the 1e-6 floor. Jittering the wrist produced inputs of ~20000
  and training collapsed to 14%. Now the wrist is never jittered and std is floored at 1e-2.
  The browser must not send a nonzero wrist either; subtracting the wrist from itself is exact.

### Not done on purpose

- Normalisation still differs from contract s8 (wrist->MCP9 scale, mirror rule). Kept for testing.
- Near-duplicate HaGRID classes not merged; the class list will change when we add our own.
- `ablate_noaug.json` and `holdout.json` are left untracked; rerun with the commands below.

```
.venv/bin/python prepare.py
.venv/bin/python train.py                                              # baseline.json
.venv/bin/python train.py --no-aug --out ablate_noaug
.venv/bin/python train.py --holdout ok,peace,rock,call,neutral --out holdout
.venv/bin/python fewshot.py baseline.json; .venv/bin/python fewshot.py holdout.json
.venv/bin/python embed.py                                              # parity + test_vectors.json
```
