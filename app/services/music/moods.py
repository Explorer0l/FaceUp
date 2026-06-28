"""Emotion -> Audius mood mapping for recommendations (P2).

The Vibe view's Match/Lift toggle picks the strategy:
  * match - mirror the user's mood   (sad  -> melancholic music)
  * lift  - regulate toward better    (sad  -> uplifting music)

Audius tags every track with one of a fixed mood vocabulary; we map each of our
five emotions to a few of those tags per strategy. Pure data + one function, so
it unit-tests with no network.
"""

from __future__ import annotations

# emotion -> strategy -> ordered Audius mood tags to pull from.
_MOOD_MAP: dict[str, dict[str, list[str]]] = {
    "happy": {
        "match": ["Upbeat", "Excited", "Energizing"],
        "lift": ["Empowering", "Energizing", "Upbeat"],
    },
    "sad": {
        "match": ["Melancholy", "Sentimental", "Yearning"],
        "lift": ["Upbeat", "Excited", "Empowering"],
    },
    "angry": {
        "match": ["Aggressive", "Fiery", "Defiant", "Rowdy"],
        "lift": ["Peaceful", "Easygoing", "Tender"],
    },
    "surprised": {
        "match": ["Excited", "Energizing", "Stirring"],
        "lift": ["Easygoing", "Peaceful"],
    },
    "neutral": {
        "match": ["Cool", "Easygoing", "Sophisticated"],
        "lift": ["Upbeat", "Empowering"],
    },
}

# Used when the emotion isn't one of our five (defensive).
DEFAULT_MOODS = ["Easygoing", "Cool"]


def moods_for(emotion: str, mode: str) -> list[str]:
    """Audius mood tags for an emotion + mode ('match' | 'lift')."""
    by_mode = _MOOD_MAP.get((emotion or "").lower())
    if not by_mode:
        return list(DEFAULT_MOODS)
    mode = "lift" if (mode or "").lower() == "lift" else "match"
    return list(by_mode[mode])
