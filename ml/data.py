"""Load FER2013 and turn it into ready-to-train tensors.

Accepts either layout (auto-detected):
  * the classic ``fer2013.csv`` (columns: emotion, pixels, Usage), or
  * an image-folder dataset: ``<root>/train/<class>/*.jpg`` and ``<root>/test/...``
    where <class> is one of FER's 7 names.

Labels are remapped to our 5 grouped classes on load.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from ml import config, preprocessing as pp


def _load_csv(csv_path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    import csv

    train_x, train_y, test_x, test_y = [], [], [], []
    with open(csv_path, newline="") as f:
        for row in csv.DictReader(f):
            pixels = np.fromstring(row["pixels"], sep=" ", dtype=np.uint8)
            img = pixels.reshape(config.IMG_SIZE, config.IMG_SIZE)
            label = int(row["emotion"])
            if row.get("Usage", "Training") == "Training":
                train_x.append(img); train_y.append(label)
            else:
                test_x.append(img); test_y.append(label)
    return (
        np.asarray(train_x, np.uint8), np.asarray(train_y, np.int64),
        np.asarray(test_x, np.uint8), np.asarray(test_y, np.int64),
    )


def _load_folder(root: Path, split: str) -> tuple[np.ndarray, np.ndarray]:
    xs, ys = [], []
    for fer_idx, name in enumerate(config.FER_CLASSES):
        d = root / split / name
        if not d.is_dir():
            continue
        for img_path in d.glob("*.*"):
            img = cv2.imread(str(img_path), cv2.IMREAD_GRAYSCALE)
            if img is None:
                continue
            if img.shape != (config.IMG_SIZE, config.IMG_SIZE):
                img = cv2.resize(img, (config.IMG_SIZE, config.IMG_SIZE))
            xs.append(img); ys.append(fer_idx)
    return np.asarray(xs, np.uint8), np.asarray(ys, np.int64)


def load_raw() -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Return (train_x, train_y, test_x, test_y) as uint8 images + FER labels."""
    root = config.DATA_ROOT
    csv_candidate = root if root.suffix == ".csv" else root / "fer2013.csv"
    if csv_candidate.is_file():
        return _load_csv(csv_candidate)
    if (root / "train").is_dir():
        tx, ty = _load_folder(root, "train")
        ex, ey = _load_folder(root, "test")
        return tx, ty, ex, ey
    raise FileNotFoundError(
        f"No dataset at {root}. Provide fer2013.csv or train/ & test/ image folders. "
        "See ml/README.md."
    )


def build_datasets() -> dict[str, np.ndarray]:
    """Load + preprocess into train/val/test tensors ready for Keras."""
    train_x, train_y_fer, test_x, test_y_fer = load_raw()

    # Topic 7: remap to our 5 classes, then normalize + shape (Topic 6).
    train_y = pp.remap_fer_to_five(train_y_fer)
    test_y = pp.remap_fer_to_five(test_y_fer)
    train_x = pp.add_channel_axis(pp.normalize_images(train_x))
    test_x = pp.add_channel_axis(pp.normalize_images(test_x))

    x_tr, y_tr, x_val, y_val = pp.train_val_split(train_x, train_y, config.VAL_FRACTION)

    return {
        "x_train": x_tr, "y_train": y_tr, "y_train_oh": pp.one_hot(y_tr),
        "x_val": x_val, "y_val": y_val, "y_val_oh": pp.one_hot(y_val),
        "x_test": test_x, "y_test": test_y, "y_test_oh": pp.one_hot(test_y),
    }
