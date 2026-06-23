"""Emotion-recognition service: the only place that talks to DeepFace.

Responsibilities:
  * decode a base64 image into an OpenCV/NumPy BGR array,
  * run DeepFace emotion analysis,
  * normalise DeepFace's output into our :class:`FaceResult` schema,
  * warm the model up once at startup so the first real request is fast.
"""

from __future__ import annotations

import base64
import binascii
import time

import cv2
import numpy as np

from app.config import EMOTION_GROUPS, settings
from app.schemas import Box, FaceResult

# DeepFace is imported lazily inside functions: importing it pulls in
# TensorFlow (slow), so we defer it until the app actually needs it.

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


def _to_face_results(detections: list[dict]) -> list[FaceResult]:
    """Convert raw DeepFace dicts into our schema, dropping non-detections."""
    results: list[FaceResult] = []
    for det in detections:
        region = det.get("region", {}) or {}
        # DeepFace returns the whole image as the region when it finds no face;
        # such "detections" usually have face_confidence 0 — skip them.
        if det.get("face_confidence", 1) == 0:
            continue

        raw_scores = det.get("emotion", {}) or {}
        # Collapse the raw 7 classes into our reduced set by summing each group.
        scores = {
            group: round(
                sum(float(raw_scores.get(member, 0.0)) for member in members), 2
            )
            for group, members in EMOTION_GROUPS.items()
        }
        dominant = max(scores, key=scores.get) if scores else "unknown"
        if scores.get(dominant, 0.0) < settings.min_confidence:
            continue

        results.append(
            FaceResult(
                box=Box(
                    x=int(region.get("x", 0)),
                    y=int(region.get("y", 0)),
                    w=int(region.get("w", 0)),
                    h=int(region.get("h", 0)),
                ),
                dominant=dominant,
                scores=scores,
            )
        )
    return results


def analyze_frame(frame: np.ndarray) -> tuple[list[FaceResult], int]:
    """Run emotion analysis on a BGR frame.

    Returns ``(faces, infer_ms)``. An empty list means no face was found.
    """
    from deepface import DeepFace

    start = time.perf_counter()
    detections = DeepFace.analyze(
        img_path=frame,
        actions=("emotion",),
        detector_backend=settings.detector_backend,
        enforce_detection=settings.enforce_detection,
        silent=True,
    )
    infer_ms = int((time.perf_counter() - start) * 1000)

    # DeepFace returns a dict for a single face, a list for many.
    if isinstance(detections, dict):
        detections = [detections]

    return _to_face_results(detections), infer_ms


def warmup() -> None:
    """Load the model once with a synthetic image (Risk #2).

    Called at server startup so the first user request isn't penalised by the
    one-off TensorFlow/model-load cost.
    """
    global _model_ready
    dummy = np.zeros((224, 224, 3), dtype=np.uint8)
    try:
        analyze_frame(dummy)
    except Exception:  # noqa: BLE001 — warmup must never crash the server
        # A blank image legitimately has no face; that's fine. We only care
        # that the model weights got loaded into memory.
        pass
    _model_ready = True


def is_ready() -> bool:
    return _model_ready
