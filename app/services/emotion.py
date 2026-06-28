"""Emotion-recognition facade.

Owns the shared image decoding + warm-up, and delegates the actual inference to
the selected engine (DeepFace or one of our trained models) via the registry.
"""

from __future__ import annotations

import base64
import binascii

import cv2
import numpy as np

from app.config import settings
from app.schemas import FaceResult
from app.services.engines import registry

_model_ready = False


class ImageDecodeError(ValueError):
    """Raised when the incoming base64 payload is not a decodable image."""


def decode_base64_image(image: str) -> np.ndarray:
    """Decode a (possibly data-URL-prefixed) base64 string to a BGR array."""
    if "," in image and image.strip().startswith("data:"):
        image = image.split(",", 1)[1]

    try:
        raw = base64.b64decode(image, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ImageDecodeError("Payload is not valid base64.") from exc

    if len(raw) > settings.max_image_bytes:
        raise ImageDecodeError("Image exceeds the maximum allowed size.")

    buf = np.frombuffer(raw, dtype=np.uint8)
    frame = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if frame is None:
        raise ImageDecodeError("Could not decode image bytes.")
    return frame


def analyze_frame(
    frame: np.ndarray, model: str, mode: str
) -> tuple[list[FaceResult], int]:
    """Run the chosen model on a BGR frame. Empty list means no face."""
    return registry.get(model).predict(frame, mode)


def available_models() -> list[dict[str, str]]:
    return registry.available_models()


def warmup() -> None:
    """Build the engine registry (warms DeepFace, loads any trained models)."""
    global _model_ready
    registry.init()
    _model_ready = True


def is_ready() -> bool:
    return _model_ready
