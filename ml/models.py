"""Model definitions — the heart of Topics 7 (softmax regression) and 8 (CNN).

Each ``build_*`` returns an uncompiled ``tf.keras.Model`` so the trainer controls
the optimizer/loss (and can also drive a custom GradientTape loop).
"""

from __future__ import annotations

import tensorflow as tf
from tensorflow.keras import layers, models

from ml.config import CHANNELS, IMG_SIZE, NUM_CLASSES

INPUT_SHAPE = (IMG_SIZE, IMG_SIZE, CHANNELS)


def build_softmax() -> tf.keras.Model:
    """Softmax (multinomial logistic) regression — Topic 7 baseline.

    Flatten the image to a 2304-vector and apply a single dense layer with a
    softmax: this is exactly logistic regression with one-hot + cross-entropy.
    No hidden layers — the deliberate floor to compare the CNN against.
    """
    return models.Sequential(
        [
            layers.Input(INPUT_SHAPE),
            layers.Flatten(),
            layers.Dense(NUM_CLASSES, activation="softmax"),
        ],
        name="softmax_regression",
    )


def build_cnn() -> tf.keras.Model:
    """Custom convolutional network — Topic 8 centerpiece.

    Three Conv→BatchNorm→ReLU→Pool blocks (feature extraction), then dense
    layers with dropout, then a softmax output. Light data augmentation up front
    (Topic 7) helps generalisation on FER2013.
    """
    return models.Sequential(
        [
            layers.Input(INPUT_SHAPE),
            layers.RandomFlip("horizontal"),
            layers.RandomRotation(0.08),
            layers.RandomZoom(0.1),

            layers.Conv2D(32, 3, padding="same"),
            layers.BatchNormalization(), layers.Activation("relu"),
            layers.MaxPooling2D(),

            layers.Conv2D(64, 3, padding="same"),
            layers.BatchNormalization(), layers.Activation("relu"),
            layers.MaxPooling2D(),

            layers.Conv2D(128, 3, padding="same"),
            layers.BatchNormalization(), layers.Activation("relu"),
            layers.MaxPooling2D(),

            layers.Flatten(),
            layers.Dense(128, activation="relu"),
            layers.Dropout(0.4),
            layers.Dense(NUM_CLASSES, activation="softmax"),
        ],
        name="custom_cnn",
    )


# Registry so the trainer/CLI can pick a model by name.
BUILDERS = {
    "softmax": build_softmax,
    "cnn": build_cnn,
}


def build(name: str) -> tf.keras.Model:
    if name not in BUILDERS:
        raise KeyError(f"Unknown model '{name}'. Options: {list(BUILDERS)}")
    return BUILDERS[name]()
