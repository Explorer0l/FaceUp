"""Configuration for the training pipeline.

We train on FER2013 but remap its 7 raw classes to the **5 grouped classes**
the app uses, so the trained models drop straight into FaceUp.
"""

from __future__ import annotations

import os
from pathlib import Path

# FER2013's labels, in its native integer order (0..6).
FER_CLASSES = ("angry", "disgust", "fear", "happy", "sad", "surprise", "neutral")

# Our app's 5 classes — order must match app/config.py::EMOTION_GROUPS.
FIVE_CLASSES = ("happy", "sad", "angry", "surprised", "neutral")
FIVE_INDEX = {name: i for i, name in enumerate(FIVE_CLASSES)}

# How each FER class folds into our 5 (disgust→angry, fear→surprised).
FER_TO_FIVE = {
    "angry": "angry",
    "disgust": "angry",
    "fear": "surprised",
    "happy": "happy",
    "sad": "sad",
    "surprise": "surprised",
    "neutral": "neutral",
}

# FER class index (0..6) -> our 5-class index (0..4).
FER_IDX_TO_FIVE_IDX = {
    i: FIVE_INDEX[FER_TO_FIVE[name]] for i, name in enumerate(FER_CLASSES)
}

# --- Image / data ----------------------------------------------------------
IMG_SIZE = 48          # FER2013 images are 48x48
CHANNELS = 1           # grayscale
NUM_CLASSES = len(FIVE_CLASSES)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
# Point this at either a fer2013.csv file or a folder of train/ test/ images.
DATA_ROOT = Path(os.environ.get("FACEUP_DATA_ROOT", PROJECT_ROOT / "data" / "fer2013"))
ARTIFACTS = Path(os.environ.get("FACEUP_ARTIFACTS", PROJECT_ROOT / "ml" / "artifacts"))

# --- Training defaults -----------------------------------------------------
BATCH_SIZE = 64
EPOCHS = 30
LEARNING_RATE = 1e-3
VAL_FRACTION = 0.1     # carved from the training split
SEED = 42
