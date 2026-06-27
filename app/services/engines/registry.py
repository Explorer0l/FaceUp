"""Engine registry — discovers which engines are usable and routes by name."""

from __future__ import annotations

from .base import EmotionEngine
from .deepface_engine import DeepFaceEngine
from .keras_engine import KerasEngine

# Our trainable models (id -> display label). They become available only once
# their weights exist in ml/artifacts/.
_TRAINED = {
    "cnn": "Custom CNN",
    "softmax": "Softmax regression",
    "transfer": "Transfer (MobileNetV2)",
}

DEFAULT = "deepface"

_engines: dict[str, EmotionEngine] = {}


def init() -> None:
    """Build the registry: DeepFace always, plus any trained models found."""
    global _engines
    engines: dict[str, EmotionEngine] = {}

    df = DeepFaceEngine()
    df.warmup()
    engines[df.name] = df

    for name, label in _TRAINED.items():
        eng = KerasEngine(name, label)
        if eng.available:
            engines[name] = eng

    _engines = engines


def available_models() -> list[dict[str, str]]:
    return [{"id": e.name, "label": e.label} for e in _engines.values()]


def get(name: str) -> EmotionEngine:
    """Return the requested engine, falling back to the default."""
    return _engines.get(name) or _engines[DEFAULT]
