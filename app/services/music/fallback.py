"""Local royalty-free tracks per mood - the offline safety net for the demo.

If Audius is unreachable (or returns nothing), recommendations fall back to a
small bundled set so the player never goes silent during a live demo. Files live
in ``app/static/audio/`` and are described by ``manifest.json``:

    {
      "Upbeat": [
        {"title": "...", "artist": "...", "file": "upbeat-1.mp3", "duration": 142}
      ],
      ...
    }

The manifest may be empty (``{}``) until CC0/royalty-free tracks are dropped in;
``tracks_for`` then simply returns no fallback.
"""

from __future__ import annotations

import json
from pathlib import Path

_DIR = Path(__file__).resolve().parent.parent.parent / "static" / "audio"
_MANIFEST = _DIR / "manifest.json"


def _load() -> dict[str, list[dict]]:
    if not _MANIFEST.is_file():
        return {}
    try:
        data = json.loads(_MANIFEST.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def tracks_for(moods: list[str], limit: int) -> list[dict]:
    """Bundled tracks whose mood is in ``moods`` (best-effort, may be [])."""
    catalog = _load()
    wanted = {m.lower() for m in moods}
    out: list[dict] = []
    for mood, items in catalog.items():
        if mood.lower() not in wanted:
            continue
        for it in items:
            fname = it.get("file")
            if not fname:
                continue
            out.append(
                {
                    "id": f"local:{fname}",
                    "title": it.get("title") or fname,
                    "artist": it.get("artist") or "FaceUp library",
                    "mood": it.get("mood") or mood,
                    "genre": it.get("genre") or "",
                    "duration": int(it.get("duration") or 0),
                    "stream_url": f"/static/audio/{fname}",
                    "cover_url": it.get("cover") or "",
                    "source": "local",
                }
            )
    return out[:limit]
