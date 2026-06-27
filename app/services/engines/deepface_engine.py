"""DeepFace engine — the pretrained baseline (always available)."""

from __future__ import annotations

import time

import numpy as np

from app.config import EMOTION_GROUPS, settings
from app.schemas import FaceResult

from .base import EmotionEngine, make_face_result


def group_scores(raw: dict) -> dict[str, float]:
    """Collapse DeepFace's 7 raw emotion scores into our 5 grouped classes."""
    return {
        group: round(sum(float(raw.get(m, 0.0)) for m in members), 2)
        for group, members in EMOTION_GROUPS.items()
    }


class DeepFaceEngine(EmotionEngine):
    name = "deepface"
    label = "DeepFace (pretrained)"

    def predict(self, frame: np.ndarray, mode: str) -> tuple[list[FaceResult], int]:
        from deepface import DeepFace

        backend = (
            settings.detector_webcam if mode == "webcam" else settings.detector_upload
        )
        start = time.perf_counter()
        detections = DeepFace.analyze(
            img_path=frame,
            actions=("emotion",),
            detector_backend=backend,
            enforce_detection=settings.enforce_detection,
            silent=True,
        )
        infer_ms = int((time.perf_counter() - start) * 1000)

        if isinstance(detections, dict):
            detections = [detections]

        results: list[FaceResult] = []
        for det in detections:
            if det.get("face_confidence", 1) == 0:
                continue
            region = det.get("region", {}) or {}
            scores = group_scores(det.get("emotion", {}) or {})
            fr = make_face_result(
                region.get("x", 0), region.get("y", 0),
                region.get("w", 0), region.get("h", 0), scores,
            )
            if fr:
                results.append(fr)
        return results, infer_ms

    def warmup(self) -> None:
        dummy = np.zeros((224, 224, 3), dtype=np.uint8)
        for mode in ("webcam", "upload"):
            try:
                self.predict(dummy, mode)
            except Exception:  # noqa: BLE001 — warmup must never crash startup
                pass
