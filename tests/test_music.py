"""Tests for the P2 music backend — mood mapping, normalization, fallback.

All offline: the one test that exercises recommend() monkeypatches the Audius
client to fail, so the suite never hits the network.
"""

from __future__ import annotations

from app.services.music import audius
from app.services.music import recommend as reco
from app.services.music.moods import DEFAULT_MOODS, moods_for


def test_match_and_lift_differ():
    assert moods_for("sad", "match") != moods_for("sad", "lift")
    assert "Melancholy" in moods_for("sad", "match")  # mirror the mood
    assert "Upbeat" in moods_for("sad", "lift")        # regulate it upward


def test_unknown_emotion_uses_defaults():
    assert moods_for("confused", "match") == DEFAULT_MOODS
    assert moods_for("", "lift") == DEFAULT_MOODS


def test_non_lift_mode_treated_as_match():
    assert moods_for("happy", "whatever") == moods_for("happy", "match")


def test_normalize_skips_unplayable_tracks():
    assert audius.normalize({"id": "x", "is_delete": True}) is None
    assert audius.normalize({"id": "x", "is_streamable": False}) is None
    assert audius.normalize({"title": "no id"}) is None


def test_normalize_maps_fields():
    t = audius.normalize(
        {"id": "abc", "title": "Song", "user": {"name": "Artist"},
         "mood": "Upbeat", "duration": 120}
    )
    assert t is not None
    assert t["id"] == "abc"
    assert t["artist"] == "Artist"
    assert t["source"] == "audius"
    assert t["stream_url"].endswith("/v1/tracks/abc/stream?app_name=FaceUp")


def test_recommend_falls_back_to_local_when_audius_down(monkeypatch):
    def boom(mood, limit):
        raise audius.AudiusError("network down")

    monkeypatch.setattr(reco.audius, "search_by_mood", boom)
    out = reco.recommend("happy", "match", limit=5)
    assert out["source"] == "local"          # gracefully degraded
    assert out["emotion"] == "happy"
    assert out["mode"] == "match"
    assert isinstance(out["tracks"], list)   # empty manifest -> [] (no crash)
