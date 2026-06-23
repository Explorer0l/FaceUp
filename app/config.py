"""Central configuration for FaceUp.

Everything tunable lives here so we never hunt through code to change behaviour.
Values can be overridden with environment variables (prefix ``FACEUP_``).
"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env(name: str, default: str) -> str:
    return os.environ.get(f"FACEUP_{name}", default)


@dataclass(frozen=True)
class Settings:
    # --- Model / inference ---------------------------------------------------
    # DeepFace face-detector backend. "opencv" is fast (good for live webcam);
    # "mtcnn" / "retinaface" are slower but more accurate (good for uploads).
    detector_backend: str = _env("DETECTOR_BACKEND", "opencv")

    # If True, DeepFace raises when no face is found. We keep it False and
    # handle the empty case ourselves (Risk #4).
    enforce_detection: bool = False

    # Minimum dominant-emotion confidence (%) before we surface a label.
    min_confidence: float = float(_env("MIN_CONFIDENCE", "0.0"))

    # --- Server --------------------------------------------------------------
    host: str = _env("HOST", "127.0.0.1")
    port: int = int(_env("PORT", "8000"))

    # Max accepted image payload (base64) in bytes — guards against huge frames.
    max_image_bytes: int = int(_env("MAX_IMAGE_BYTES", str(8 * 1024 * 1024)))


settings = Settings()

# We collapse DeepFace's 7 raw classes into a smaller, clearer set. DeepFace
# routinely confuses visually-similar expressions, so we *sum* the probabilities
# of grouped classes rather than dropping any signal:
#   angry      <- angry + disgust
#   surprised  <- surprise + fear
# happy / sad / neutral pass through unchanged. Keys define the display order.
EMOTION_GROUPS = {
    "happy": ("happy",),
    "sad": ("sad",),
    "angry": ("angry", "disgust"),
    "surprised": ("surprise", "fear"),
    "neutral": ("neutral",),
}

# The reduced set the app exposes, in a stable display order.
EMOTION_LABELS = tuple(EMOTION_GROUPS.keys())
