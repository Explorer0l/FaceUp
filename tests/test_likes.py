"""Tests for the Favorites (likes) service — like/unlike/list, idempotency.

Uses an in-memory SQLite session so nothing touches the real data/ directory.
"""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.services.music import likes


@pytest.fixture
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def _track(track_id: str = "QbW6OE9", **over) -> dict:
    t = {
        "id": track_id, "title": "Light It Up", "artist": "Nezuki",
        "mood": "Upbeat", "genre": "Trance", "duration": 212,
        "stream_url": f"https://audius.example/{track_id}",
        "cover_url": "https://covers.example/x.jpg", "source": "audius",
    }
    t.update(over)
    return t


def test_like_persists_snapshot(session):
    row = likes.like_track(session, _track())
    assert row.id is not None and row.track_id == "QbW6OE9"
    listed = likes.list_likes(session)
    assert len(listed) == 1 and listed[0].title == "Light It Up"
    # The snapshot round-trips back to the shared Track shape.
    norm = likes.to_track(listed[0])
    assert norm["id"] == "QbW6OE9"
    assert norm["stream_url"] == "https://audius.example/QbW6OE9"
    assert norm["source"] == "audius"


def test_like_is_idempotent(session):
    first = likes.like_track(session, _track())
    again = likes.like_track(session, _track(title="changed"))  # same id
    assert again.id == first.id
    assert len(likes.list_likes(session)) == 1


def test_unlike_removes_and_reports(session):
    likes.like_track(session, _track())
    assert likes.unlike_track(session, "QbW6OE9") is True
    assert likes.list_likes(session) == []
    assert likes.unlike_track(session, "QbW6OE9") is False  # already gone


def test_liked_ids_lists_all(session):
    likes.like_track(session, _track("a"))
    likes.like_track(session, _track("b"))
    assert set(likes.liked_ids(session)) == {"a", "b"}


def test_like_supports_local_uploads(session):
    row = likes.like_track(
        session, _track("upload:7", source="local", stream_url="/uploads/x.mp3")
    )
    assert row.track_id == "upload:7"
    assert likes.to_track(row)["stream_url"] == "/uploads/x.mp3"


def test_like_requires_id_and_stream(session):
    with pytest.raises(ValueError):
        likes.like_track(session, {"title": "x", "stream_url": "u"})  # no id
    with pytest.raises(ValueError):
        likes.like_track(session, {"id": "x", "title": "x"})  # no stream_url
