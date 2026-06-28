"""Recommendation service: emotion -> moods -> tracks (Audius, local fallback).

Pulls a share of tracks from each mapped mood so the mix reflects the whole
mapping, dedupes, shuffles, and caps at the requested limit. If Audius yields
nothing (offline), falls back to the bundled local library.
"""

from __future__ import annotations

import math
import random

from app.config import settings
from app.services.music import audius, fallback
from app.services.music.moods import moods_for


def recommend(emotion: str, mode: str, limit: int | None = None) -> dict:
    limit = limit or settings.reco_limit
    mode = "lift" if (mode or "").lower() == "lift" else "match"
    emotion = (emotion or "").lower()
    moods = moods_for(emotion, mode)

    per_mood = max(3, math.ceil(limit / max(1, len(moods))))
    tracks: list[dict] = []
    seen: set[str] = set()
    for mood in moods:
        try:
            raws = audius.search_by_mood(mood, per_mood * 2)
        except audius.AudiusError:
            continue  # one bad mood shouldn't sink the whole request
        for raw in raws:
            t = audius.normalize(raw)
            if t and t["id"] not in seen:
                seen.add(t["id"])
                tracks.append(t)

    source = "audius" if tracks else "local"
    if not tracks:  # Audius unreachable or empty -> offline safety net
        tracks = fallback.tracks_for(moods, limit)

    random.shuffle(tracks)
    return {
        "emotion": emotion,
        "mode": mode,
        "moods": moods,
        "tracks": tracks[:limit],
        "source": source,
    }
