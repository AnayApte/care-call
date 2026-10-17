"""Train the baseline MLP on the prepared landmark dataset and export JSON.

Reads ml/data/{train,val}.npz and ml/data/classes.json.
Writes ml/baseline.json, ml/report.md and ml/confusion.png.
"""
import json
import time
from pathlib import Path

import matplotlib
import numpy as np
import torch
from sklearn.metrics import confusion_matrix
from torch import nn

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
BATCH = 64
MAX_EPOCHS = 40
PATIENCE = 5
EMBEDDING_LAYER = 1  # output of the second ReLU (32 floats) is the embedding
VERSION = "baseline_v1"


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


def load():
    tr, va = np.load(DATA / "train.npz"), np.load(DATA / "val.npz")
    classes = json.load(open(DATA / "classes.json"))["classes"]
    return tr, va, classes


def evaluate(model, X, y):
    model.eval()
    with torch.no_grad():
        pred = model(X).argmax(1)
    return (pred == y).float().mean().item(), pred


def train(model, Xtr, ytr, Xva, yva):
    opt = torch.optim.Adam(model.parameters(), lr=LR)
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
            opt.zero_grad()
            loss = loss_fn(model(Xtr[idx]), ytr[idx])
            loss.backward()
            opt.step()
            total += loss.item() * len(idx)
        train_acc, _ = evaluate(model, Xtr, ytr)
        val_acc, _ = evaluate(model, Xva, yva)
        print(f"epoch {epoch:2d} loss {total / n:.4f} "
              f"train_acc {train_acc:.4f} val_acc {val_acc:.4f}", flush=True)
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


def export_json(model, mean, std, classes, metrics, path):
    def layer(lin, act):
        return {"W": lin.weight.detach().numpy().astype(float).tolist(),  # [out, in]
                "b": lin.bias.detach().numpy().astype(float).tolist(),
                "act": act}

    doc = {
        "version": VERSION,
        "input_dim": INPUT_DIM,
        "normalisation": "wrist_relative_v1",
        "mean": mean.tolist(),
        "std": std.tolist(),
        "classes": classes,
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

The split is by `user_id` (sha256 hash, 80/20), so no person appears in both sets.
Confusion matrix: `confusion.png`.

## Per-class validation accuracy

| class | n_val | accuracy |
| --- | --- | --- |
{rows}

## Model

MLP `42 -> 64 -> 32 -> {len(classes)}`, ReLU, dropout 0.2 during training only, Adam lr 1e-3,
batch 64, up to 40 epochs, early stopping (patience 5 on validation accuracy), seed 42.
Inputs are standardised with the training mean and std, both stored in `baseline.json`.
The 32-float output of the second ReLU (`embedding_layer: 1`) is the embedding the browser
uses for the personal kNN. `embed.py` is the numpy reference implementation.

## Landmark normalisation (`wrist_relative_v1`)

1. Subtract point 0 (wrist) from all 21 points.
2. Divide all points by the Euclidean distance from point 0 to point 9 (middle-finger MCP).
3. **Handedness rule.** HaGRID gives no left/right label, so we infer orientation from the
   palm: if point 17 (pinky MCP) has a smaller x than point 5 (index MCP) after wrist
   subtraction, mirror x to -x. Both hands then share one canonical orientation.
   The browser must apply the identical rule before calling the model.
4. Flatten to 42 floats in `x0, y0, x1, y1, ...` order.

Hands without landmarks or without exactly 21 points were skipped. Each class was capped
at 2000 hands sampled with seed 42. `no_gesture` was renamed `neutral`.

## Dataset

HaGRIDv2 (HAnd Gesture Recognition Image Dataset), landmark annotations.
Nuzhdin, A., Nagaev, A., Sautin, A., Kapitanov, A., Kvanchiani, K. (2024).
*HaGRIDv2: 1M Images for Static and Dynamic Hand Gesture Recognition.*
https://github.com/hukenovs/hagrid. Licence: CC BY-SA 4.0.
"""
    path.write_text(text)


def main():
    torch.manual_seed(SEED)
    np.random.seed(SEED)
    tr, va, classes = load()
    mean = tr["X"].mean(0).astype(np.float32)
    std = tr["X"].std(0).astype(np.float32) + 1e-6
    Xtr = torch.from_numpy((tr["X"] - mean) / std)
    Xva = torch.from_numpy((va["X"] - mean) / std)
    ytr, yva = torch.from_numpy(tr["y"]), torch.from_numpy(va["y"])
    print(f"train {len(ytr)} val {len(yva)} classes {len(classes)}")

    model = MLP(len(classes))
    t0 = time.time()
    best_acc, epochs_run = train(model, Xtr, ytr, Xva, yva)
    seconds = time.time() - t0

    val_acc, pred = evaluate(model, Xva, yva)
    cm = confusion_matrix(yva.numpy(), pred.numpy(), labels=range(len(classes)))
    per_class = np.diag(cm) / np.maximum(cm.sum(1), 1)
    metrics = {
        "val_acc": round(val_acc, 4),
        "n_train": int(len(ytr)),
        "n_val": int(len(yva)),
        "n_users_train": int(tr["n_users"]),
        "n_users_val": int(va["n_users"]),
        "train_seconds": round(seconds, 1),
        "epochs": epochs_run,
    }
    export_json(model, mean, std, classes, metrics, HERE / "baseline.json")
    save_confusion(cm, classes, HERE / "confusion.png")
    write_report(HERE / "report.md", classes, per_class, metrics, cm)
    print(f"val_acc {val_acc:.4f} best {best_acc:.4f} in {seconds:.1f}s -> baseline.json, report.md, confusion.png")


if __name__ == "__main__":
    main()
