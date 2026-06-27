"""Train an emotion model.

Examples:
    python -m ml.train --model cnn --epochs 30
    python -m ml.train --model cnn --loop gradtape --epochs 15
    python -m ml.train --model softmax --epochs 20

``--loop keras`` uses ``model.fit`` (Keras API, Topic 8); ``--loop gradtape``
runs an explicit training loop with ``tf.GradientTape`` (TF core, Topic 8) — same
model, lower-level, to demonstrate what ``.fit`` does under the hood.
"""

from __future__ import annotations

import os

# Train under the same Keras dialect the app uses (legacy Keras 2 / tf-keras),
# so the saved .keras model loads in the app where DeepFace forces legacy Keras.
# Must be set before TensorFlow is imported.
os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")

import argparse
import json

import numpy as np
import tensorflow as tf

from ml import config, models
from ml.data import build_datasets
from ml.preprocessing import class_weights


def _save_curves(history: dict, model_name: str) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10, 4))
    a1.plot(history["loss"], label="train"); a1.plot(history["val_loss"], label="val")
    a1.set_title("loss"); a1.set_xlabel("epoch"); a1.legend()
    a2.plot(history["accuracy"], label="train"); a2.plot(history["val_accuracy"], label="val")
    a2.set_title("accuracy"); a2.set_xlabel("epoch"); a2.legend()
    fig.tight_layout()
    out = config.ARTIFACTS / f"{model_name}_curves.png"
    fig.savefig(out)
    print(f"saved {out}")


def train_keras(model, d, args) -> dict:
    model.compile(
        optimizer=tf.keras.optimizers.Adam(args.lr),
        loss="categorical_crossentropy",  # Topic 7: cross-entropy
        metrics=["accuracy"],
    )
    callbacks = [
        tf.keras.callbacks.EarlyStopping(patience=6, restore_best_weights=True),
        tf.keras.callbacks.ReduceLROnPlateau(patience=3, factor=0.5),
    ]
    fit_kwargs = {}
    if args.class_weight:
        # WARNING: inverse-frequency class weights destabilise the BatchNorm CNN —
        # the weighted loss collapses it to uniform output (train+val loss stuck at
        # ln(NUM_CLASSES), accuracy at chance). The linear softmax model has no
        # BatchNorm and is unaffected. FER2013 remapped to 5 classes is only mildly
        # imbalanced (15-25%), so we train unweighted by default; opt in for
        # experiments with --class-weight. (Topic 7: class-imbalance handling.)
        fit_kwargs["class_weight"] = class_weights(d["y_train"])
    hist = model.fit(
        d["x_train"], d["y_train_oh"],
        validation_data=(d["x_val"], d["y_val_oh"]),
        epochs=args.epochs, batch_size=args.batch,
        callbacks=callbacks, verbose=2,
        **fit_kwargs,
    )
    return hist.history


def train_gradtape(model, d, args) -> dict:
    """Explicit training loop — Topic 8: tf.GradientTape + manual optimisation."""
    opt = tf.keras.optimizers.Adam(args.lr)
    loss_fn = tf.keras.losses.CategoricalCrossentropy()
    ds = (
        tf.data.Dataset.from_tensor_slices((d["x_train"], d["y_train_oh"]))
        .shuffle(4096).batch(args.batch)
    )
    history = {k: [] for k in ("loss", "accuracy", "val_loss", "val_accuracy")}
    train_acc = tf.keras.metrics.CategoricalAccuracy()
    val_acc = tf.keras.metrics.CategoricalAccuracy()

    for epoch in range(args.epochs):
        train_acc.reset_state(); running = 0.0; steps = 0
        for xb, yb in ds:
            with tf.GradientTape() as tape:
                preds = model(xb, training=True)
                loss = loss_fn(yb, preds)
            grads = tape.gradient(loss, model.trainable_variables)
            opt.apply_gradients(zip(grads, model.trainable_variables))
            train_acc.update_state(yb, preds)
            running += float(loss); steps += 1

        val_preds = model(d["x_val"], training=False)
        val_acc.reset_state(); val_acc.update_state(d["y_val_oh"], val_preds)
        vloss = float(loss_fn(d["y_val_oh"], val_preds))
        history["loss"].append(running / steps)
        history["accuracy"].append(float(train_acc.result()))
        history["val_loss"].append(vloss)
        history["val_accuracy"].append(float(val_acc.result()))
        print(f"epoch {epoch+1}/{args.epochs} "
              f"loss={running/steps:.3f} acc={float(train_acc.result()):.3f} "
              f"val_loss={vloss:.3f} val_acc={float(val_acc.result()):.3f}")
    return history


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", choices=list(models.BUILDERS), default="cnn")
    ap.add_argument("--loop", choices=("keras", "gradtape"), default="keras")
    ap.add_argument("--epochs", type=int, default=config.EPOCHS)
    ap.add_argument("--batch", type=int, default=config.BATCH_SIZE)
    ap.add_argument("--lr", type=float, default=config.LEARNING_RATE)
    ap.add_argument(
        "--class-weight", action="store_true",
        help="Apply inverse-frequency class weights. NOTE: collapses the BatchNorm "
             "CNN to chance; safe for the softmax model. Off by default.",
    )
    args = ap.parse_args()

    tf.random.set_seed(config.SEED)
    np.random.seed(config.SEED)
    config.ARTIFACTS.mkdir(parents=True, exist_ok=True)

    print(f"Loading dataset from {config.DATA_ROOT} …")
    d = build_datasets()
    print(f"train={len(d['x_train'])} val={len(d['x_val'])} test={len(d['x_test'])}")

    model = models.build(args.model)
    model.summary()

    history = (train_keras if args.loop == "keras" else train_gradtape)(model, d, args)

    path = config.ARTIFACTS / f"{args.model}.keras"
    model.save(path)
    (config.ARTIFACTS / f"{args.model}_meta.json").write_text(
        json.dumps({"classes": list(config.FIVE_CLASSES), "loop": args.loop}, indent=2)
    )
    _save_curves(history, args.model)
    print(f"saved model -> {path}")


if __name__ == "__main__":
    main()
