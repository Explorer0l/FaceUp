"""Common engine interface + shared helpers."""

from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np

from app.config import settings
from app.schemas import Box, FaceResult


class EmotionEngine(ABC):
    """An emotion recogniser. ``name`` is the API id; ``label`` is for display."""

    name: str = "base"
    label: str = "Base"

    @property
    def available(self) -> bool:
        return True

    @abstractmethod
    def predict(self, frame: np.ndarray, mode: str) -> tuple[list[FaceResult], int]:
        """Return ``(faces, infer_ms)`` for a BGR frame. Empty list = no face."""
        raise NotImplementedError


def make_face_result(x, y, w, h, scores: dict[str, float]) -> FaceResult | None:
    """Build a FaceResult, dropping faces below the confidence threshold."""
    if not scores:
        return None
    dominant = max(scores, key=scores.get)
    if scores[dominant] < settings.min_confidence:
        return None
    return FaceResult(
        box=Box(x=int(x), y=int(y), w=int(w), h=int(h)),
        dominant=dominant,
        scores=scores,
    )
