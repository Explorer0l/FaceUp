"""Evaluate a trained model on the FER2013 test split.

    python -m ml.evaluate --model cnn

Produces accuracy, a per-class report (Topic 7 metrics), and a confusion-matrix
figure for the report.
"""

from __future__ import annotations

import argparse

import numpy as np
import tensorflow as tf
from sklearn.metrics import classification_report, confusion_matrix

from ml import config
from ml.data import build_datasets


def _plot_confusion(cm: np.ndarray, model_name: str) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    cmn = cm.astype(float) / cm.sum(axis=1, keepdims=True).clip(min=1)
    fig, ax = plt.subplots(figsize=(6, 5))
    ax.imshow(cmn, cmap="magma")
    ax.set_xticks(range(config.NUM_CLASSES)); ax.set_yticks(range(config.NUM_CLASSES))
    ax.set_xticklabels(config.FIVE_CLASSES, rotation=45, ha="right")
    ax.set_yticklabels(config.FIVE_CLASSES)
    ax.set_xlabel("predicted"); ax.set_ylabel("true")
    for i in range(config.NUM_CLASSES):
        for j in range(config.NUM_CLASSES):
            ax.text(j, i, f"{cmn[i, j]:.2f}", ha="center", va="center",
                    color="white" if cmn[i, j] < 0.5 else "black", fontsize=8)
    fig.tight_layout()
    out = config.ARTIFACTS / f"{model_name}_confusion.png"
    fig.savefig(out)
    print(f"saved {out}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="cnn")
    args = ap.parse_args()

    model = tf.keras.models.load_model(config.ARTIFACTS / f"{args.model}.keras")
    d = build_datasets()
    probs = model.predict(d["x_test"], verbose=0)
    y_pred = probs.argmax(axis=1)
    y_true = d["y_test"]

    acc = float((y_pred == y_true).mean())
    print(f"\n{args.model} — test accuracy: {acc:.4f}\n")
    print(classification_report(y_true, y_pred, target_names=config.FIVE_CLASSES))
    _plot_confusion(confusion_matrix(y_true, y_pred), args.model)


if __name__ == "__main__":
    main()
