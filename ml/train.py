"""Train the baseline MLP on the prepared landmark dataset and export JSON.

Reads ml/data/{train,val}.npz and ml/data/classes.json.
Writes ml/<out>.json, and for the full model also ml/report.md and ml/confusion.png.

  .venv/bin/python train.py                         # full model -> baseline.json
  .venv/bin/python train.py --no-aug --out ablate   # ablation without augmentation
  .venv/bin/python train.py --holdout ok,peace,rock,call,neutral --out holdout
      # trains without those classes; fewshot.py then measures transfer to them
"""
import argparse
import json
import time
from pathlib import Path

import matplotlib
import numpy as np
import torch
from sklearn.metrics import confusion_matrix
from torch import nn

from augment import augment

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
SEED = 42
INPUT_DIM = 42
HIDDEN_1 = 64
HIDDEN_2 = 32
DROPOUT = 0.2
LR = 1e-3
LR_DECAY = 0.5
LR_PATIENCE = 3
BATCH = 512
MAX_EPOCHS = 100
PATIENCE = 10
EMBEDDING_LAYER = 1  # output of the second ReLU (32 floats) is the embedding
VERSION = "baseline_v2"
STD_FLOOR = 1e-2
NORMALISATION = "wrist_relative_v1"


class MLP(nn.Module):
    def __init__(self, n_classes: int):
        super().__init__()
        self.fc1 = nn.Linear(INPUT_DIM, HIDDEN_1)
        self.fc2 = nn.Linear(HIDDEN_1, HIDDEN_2)
        self.fc3 = nn.Linear(HIDDEN_2, n_classes)
        self.drop = nn.Dropout(DROPOUT)

    def forward(self, x):
        x = self.drop(torch.relu(self.fc1(x)))
        x = self.drop(torch.relu(self.fc2(x)))
        return self.fc3(x)


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--holdout", default="", help="comma-separated classes to exclude from training")
    p.add_argument("--no-aug", action="store_true", help="disable landmark augmentation")
    p.add_argument("--out", default="baseline", help="output stem, writes ml/<out>.json")
    return p.parse_args()


def load(holdout):
    """Return raw train/val arrays restricted to the trained classes, plus class lists."""
    tr, va = np.load(DATA / "train.npz"), np.load(DATA / "val.npz")
    all_classes = json.load(open(DATA / "classes.json"))["classes"]
    missing = sorted(set(holdout) - set(all_classes))
    if missing:
        raise SystemExit(f"unknown holdout classes: {missing}")
    classes = [c for c in all_classes if c not in holdout]
    remap = np.full(len(all_classes), -1, dtype=np.int64)
    for new, name in enumerate(classes):
        remap[all_classes.index(name)] = new

    def select(split):
        y = remap[split["y"]]
        keep = y >= 0
        return split["X"][keep], y[keep], int(split["n_users"])

    return select(tr), select(va), classes, all_classes


class Standardiser:
    def __init__(self, X_raw):
        self.mean = torch.from_numpy(X_raw.mean(0).astype(np.float32))
        # floor the std so constant inputs (the wrist is always 0) cannot explode
        self.std = torch.from_numpy(np.maximum(X_raw.std(0), STD_FLOOR).astype(np.float32))

    def __call__(self, x):
        return (x - self.mean) / self.std


def evaluate(model, X, y):
    model.eval()
    with torch.no_grad():
        pred = torch.cat([model(X[i:i + 8192]).argmax(1) for i in range(0, len(X), 8192)])
    return (pred == y).float().mean().item(), pred


def train(model, std, Xtr_raw, ytr, Xva, yva, use_aug):
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    sched = torch.optim.lr_scheduler.ReduceLROnPlateau(opt, mode="max", factor=LR_DECAY, patience=LR_PATIENCE)
    loss_fn = nn.CrossEntropyLoss()
    best_acc, best_state, bad, epochs_run = -1.0, None, 0, 0
    n = len(ytr)
    g = torch.Generator().manual_seed(SEED)
    for epoch in range(1, MAX_EPOCHS + 1):
        epochs_run = epoch
        model.train()
        perm = torch.randperm(n, generator=g)
        total = 0.0
        for i in range(0, n, BATCH):
            idx = perm[i:i + BATCH]
            xb = Xtr_raw[idx]
            if use_aug:
                xb = augment(xb, g)
            opt.zero_grad()
            loss = loss_fn(model(std(xb)), ytr[idx])
            loss.backward()
            opt.step()
            total += loss.item() * len(idx)
        val_acc, _ = evaluate(model, Xva, yva)
        sched.step(val_acc)
        lr = opt.param_groups[0]["lr"]
        print(f"epoch {epoch:3d} loss {total / n:.4f} val_acc {val_acc:.4f} lr {lr:.1e}", flush=True)
        if val_acc > best_acc:
            best_acc, bad = val_acc, 0
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
        else:
            bad += 1
            if bad >= PATIENCE:
                print(f"early stop at epoch {epoch} (best val_acc {best_acc:.4f})")
                break
    model.load_state_dict(best_state)
    return best_acc, epochs_run


def export_json(model, std, classes, holdout, metrics, path):
    def layer(lin, act):
        return {"W": np.round(lin.weight.detach().numpy().astype(float), 6).tolist(),  # [out, in]
                "b": np.round(lin.bias.detach().numpy().astype(float), 6).tolist(),
                "act": act}

    doc = {
        "version": VERSION,
        "input_dim": INPUT_DIM,
        "normalisation": NORMALISATION,
        "mean": std.mean.tolist(),
        "std": std.std.tolist(),
        "classes": classes,
        "holdout": holdout,
        "layers": [layer(model.fc1, "relu"), layer(model.fc2, "relu"), layer(model.fc3, "softmax")],
        "embedding_layer": EMBEDDING_LAYER,
        "metrics": metrics,
    }
    with open(path, "w") as f:
        json.dump(doc, f)


def save_confusion(cm, classes, path):
    fig, ax = plt.subplots(figsize=(12, 11))
    norm = cm / np.maximum(cm.sum(1, keepdims=True), 1)
    ax.imshow(norm, cmap="Blues", vmin=0, vmax=1)
    ax.set_xticks(range(len(classes)), classes, rotation=90, fontsize=7)
    ax.set_yticks(range(len(classes)), classes, fontsize=7)
    ax.set_xlabel("predicted")
    ax.set_ylabel("true")
    ax.set_title("Validation confusion (row-normalised), user-disjoint split")
    fig.tight_layout()
    fig.savefig(path, dpi=130)


def write_report(path, classes, per_class, metrics, cm):
    rows = "\n".join(f"| {c} | {int(cm[i].sum())} | {per_class[i]:.3f} |"
                     for i, c in enumerate(classes))
    text = f"""# Baseline static hand-pose classifier

Trained on HaGRIDv2 landmark annotations. **This is trained on able-bodied hands
from a public dataset**; it is a starting point whose hidden layer gives a general
embedding, not a model of post-stroke movement. Assistive prototype, not a medical device.

## Results

| metric | value |
| --- | --- |
| validation accuracy | {metrics['val_acc']:.4f} |
| train hands | {metrics['n_train']} |
| validation hands | {metrics['n_val']} |
| unique users (train) | {metrics['n_users_train']} |
| unique users (val) | {metrics['n_users_val']} |
| training time | {metrics['train_seconds']:.1f} s |
| epochs run | {metrics['epochs']} |
| augmentation | {metrics['augmentation']} |

The split is by `user_id` (sha256 hash, 80/20), so no person appears in both sets.
Confusion matrix: `confusion.png`. Few-shot transfer numbers and ablations: `experiments.md`.

## Per-class validation accuracy

| class | n_val | accuracy |
| --- | --- | --- |
{rows}

## Model

MLP `42 -> 64 -> 32 -> {len(classes)}`, ReLU, dropout {DROPOUT} during training only, Adam lr {LR:g}
halved after {LR_PATIENCE} epochs without improvement, batch {BATCH}, up to {MAX_EPOCHS} epochs,
early stopping (patience {PATIENCE} on validation accuracy), seed {SEED}.
Training augmentation (`augment.py`): per-hand random rotation, scale and gaussian jitter on the
raw landmarks, to stand in for weak, shaky or partially closed hands.
Inputs are standardised with the training mean and std, both stored in `baseline.json`.
The 32-float output of the second ReLU (`embedding_layer: 1`) is the embedding the browser
uses for the personal kNN. `embed.py` is the numpy reference implementation.

## Landmark normalisation (`{NORMALISATION}`)

1. Subtract point 0 (wrist) from all 21 points.
2. Divide all points by the Euclidean distance from point 0 to point 9 (middle-finger MCP).
3. **Handedness rule.** HaGRID gives no left/right label, so we infer orientation from the
   palm: if point 17 (pinky MCP) has a smaller x than point 5 (index MCP) after wrist
   subtraction, mirror x to -x. Both hands then share one canonical orientation.
   The browser must apply the identical rule before calling the model.
4. Flatten to 42 floats in `x0, y0, x1, y1, ...` order.

Note: this differs from contract section 8 (max distance from wrist, no mirror). Kept on
purpose for testing; see `shared/CONTRACT_REQUESTS.md` before shipping.

Hands without landmarks or without exactly 21 points were skipped. Every hand in the
annotations is used (no per-class cap). `no_gesture` was renamed `neutral`.

## Dataset

HaGRIDv2 (HAnd Gesture Recognition Image Dataset), landmark annotations.
Nuzhdin, A., Nagaev, A., Sautin, A., Kapitanov, A., Kvanchiani, K. (2024).
*HaGRIDv2: 1M Images for Static and Dynamic Hand Gesture Recognition.*
https://github.com/hukenovs/hagrid. Licence: CC BY-SA 4.0.
"""
    path.write_text(text)


def main():
    args = parse_args()
    holdout = [c for c in args.holdout.split(",") if c]
    use_aug = not args.no_aug
    torch.manual_seed(SEED)
    np.random.seed(SEED)
    (Xtr_raw, ytr, n_users_tr), (Xva_raw, yva, n_users_va), classes, all_classes = load(holdout)
    std = Standardiser(Xtr_raw)
    Xtr_raw, Xva_raw = torch.from_numpy(Xtr_raw), torch.from_numpy(Xva_raw)
    Xva = std(Xva_raw)
    ytr, yva = torch.from_numpy(ytr), torch.from_numpy(yva)
    print(f"train {len(ytr)} val {len(yva)} classes {len(classes)} "
          f"holdout {holdout or 'none'} aug {use_aug}")

    model = MLP(len(classes))
    t0 = time.time()
    best_acc, epochs_run = train(model, std, Xtr_raw, ytr, Xva, yva, use_aug)
    seconds = time.time() - t0

    val_acc, pred = evaluate(model, Xva, yva)
    cm = confusion_matrix(yva.numpy(), pred.numpy(), labels=range(len(classes)))
    per_class = np.diag(cm) / np.maximum(cm.sum(1), 1)
    metrics = {
        "val_acc": round(val_acc, 4),
        "n_train": int(len(ytr)),
        "n_val": int(len(yva)),
        "n_users_train": n_users_tr,
        "n_users_val": n_users_va,
        "train_seconds": round(seconds, 1),
        "epochs": epochs_run,
        "augmentation": use_aug,
    }
    out = HERE / f"{args.out}.json"
    export_json(model, std, classes, holdout, metrics, out)
    if args.out == "baseline" and not holdout:
        save_confusion(cm, classes, HERE / "confusion.png")
        write_report(HERE / "report.md", classes, per_class, metrics, cm)
    print(f"val_acc {val_acc:.4f} best {best_acc:.4f} in {seconds:.1f}s -> {out.name}")


if __name__ == "__main__":
    main()
