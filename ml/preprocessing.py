"""Preprocessing — the explicit home of Topics 6 (NumPy/tensors) and 7
(data preprocessing: normalization, encoding, train/test split).

Each function is deliberately small and documented so the report can point at a
concrete line for each concept.
"""

from __future__ import annotations

import numpy as np

from ml.config import FER_IDX_TO_FIVE_IDX, NUM_CLASSES, SEED


def remap_fer_to_five(fer_labels: np.ndarray) -> np.ndarray:
    """Map FER2013's 7 integer labels (0..6) to our 5-class labels (0..4)."""
    lut = np.array([FER_IDX_TO_FIVE_IDX[i] for i in range(7)], dtype=np.int64)
    return lut[fer_labels]


def normalize_images(images: np.ndarray) -> np.ndarray:
    """uint8 [0,255] -> float32 [0,1].

    Topic 6: pixels are stored as 1-byte ``uint8``; we cast to ``float32`` and
    scale so gradients are well-conditioned. This also makes the array's dtype
    and memory footprint explicit (uint8 = 1 byte/px, float32 = 4 bytes/px).
    """
    return images.astype(np.float32) / 255.0


def add_channel_axis(images: np.ndarray) -> np.ndarray:
    """(N, 48, 48) -> (N, 48, 48, 1): the 4-D tensor a CNN expects.

    Topic 6/8: scalar→vector→matrix→tensor. A batch of grayscale images is a
    rank-4 tensor (batch, height, width, channels).
    """
    if images.ndim == 3:
        return images[..., np.newaxis]
    return images


def flatten_images(images: np.ndarray) -> np.ndarray:
    """(N, 48, 48[,1]) -> (N, 2304): vectorised input for softmax regression."""
    return images.reshape(images.shape[0], -1)


def one_hot(labels: np.ndarray, num_classes: int = NUM_CLASSES) -> np.ndarray:
    """Integer labels -> one-hot matrix (Topic 7: categorical encoding)."""
    out = np.zeros((labels.shape[0], num_classes), dtype=np.float32)
    out[np.arange(labels.shape[0]), labels] = 1.0
    return out


def train_val_split(
    x: np.ndarray, y: np.ndarray, val_fraction: float, seed: int = SEED
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Shuffle and carve a validation set (Topic 7: train/validation split)."""
    rng = np.random.default_rng(seed)
    idx = rng.permutation(x.shape[0])
    n_val = int(x.shape[0] * val_fraction)
    val_idx, train_idx = idx[:n_val], idx[n_val:]
    return x[train_idx], y[train_idx], x[val_idx], y[val_idx]


def class_weights(labels: np.ndarray, num_classes: int = NUM_CLASSES) -> dict[int, float]:
    """Inverse-frequency weights — FER2013 is imbalanced (e.g. few 'disgust').

    Topic 7: handling class imbalance so the model doesn't ignore rare classes.
    """
    counts = np.bincount(labels, minlength=num_classes).astype(np.float32)
    counts[counts == 0] = 1.0
    weights = counts.sum() / (num_classes * counts)
    return {i: float(w) for i, w in enumerate(weights)}
