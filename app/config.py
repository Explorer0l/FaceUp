"""Central configuration for FaceUp.

Everything tunable lives here so we never hunt through code to change behaviour.
Values can be overridden with environment variables (prefix ``FACEUP_``).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Load a local .env (gitignored) so secrets like the Audius key don't have to be
# exported into the shell each run. No-op if python-dotenv isn't installed or the
# file is absent — real shell env vars still win.
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover - dotenv is optional
    pass


def _env(name: str, default: str) -> str:
    return os.environ.get(f"FACEUP_{name}", default)


@dataclass(frozen=True)
class Settings:
    # --- Model / inference ---------------------------------------------------
    # DeepFace face-detector backend, chosen per input mode (benchmarked on CPU
    # at 640x480):
    #   webcam -> "ssd"  (~34 ms): DNN-based, ~as fast as Haar but far more
    #                              robust to angle/lighting/glasses.
    #   upload -> "mtcnn" (~225 ms): more accurate on angled/small faces; fine
    #                                for a one-shot photo.
    # ("retinaface" is the most accurate but ~3.7 s/frame here — too slow.)
    detector_webcam: str = _env("DETECTOR_WEBCAM", "ssd")
    detector_upload: str = _env("DETECTOR_UPLOAD", "mtcnn")

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

    # --- Music (Audius, P2) --------------------------------------------------
    # Audius's read API authenticates with just an app_name; the API key is kept
    # for rate limits / future SDK use. See ml docs / DESIGN.md.
    audius_app_name: str = _env("AUDIUS_APP_NAME", "FaceUp")
    audius_api_key: str = _env("AUDIUS_API_KEY", "")
    # Discovery endpoint that returns healthy Audius API hosts to query.
    audius_discovery: str = _env("AUDIUS_DISCOVERY", "https://api.audius.co")
    # How many tracks a recommendation returns.
    reco_limit: int = int(_env("RECO_LIMIT", "20"))
    # Per-request network timeout (seconds) for Audius calls.
    audius_timeout: float = float(_env("AUDIUS_TIMEOUT", "8"))

    # --- Persistence / uploads (P3) ------------------------------------------
    # SQLite database + uploaded-audio directory. Both live under data/ (which is
    # gitignored) by default.
    db_path: str = _env("DB_PATH", str(_PROJECT_ROOT / "data" / "faceup.db"))
    uploads_dir: str = _env("UPLOADS_DIR", str(_PROJECT_ROOT / "data" / "uploads"))
    # Max accepted upload size (bytes) — guards disk against huge files.
    max_upload_bytes: int = int(_env("MAX_UPLOAD_BYTES", str(20 * 1024 * 1024)))


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
