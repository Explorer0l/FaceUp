"""Tests for P3 uploads — save/list/delete, normalization, mood matching.

Uses an in-memory SQLite session and a temp uploads dir, so nothing touches the
real data/ directory.
"""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.models import UploadedTrack
from app.services.music import uploads


@pytest.fixture
def session(tmp_path, monkeypatch):
    # Redirect file storage to a temp dir (settings is a frozen dataclass, so we
    # patch the path helper rather than the setting).
    updir = tmp_path / "uploads"
    updir.mkdir()
    monkeypatch.setattr(uploads, "_uploads_path", lambda: updir)
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def test_save_writes_file_and_row(session):
    row = uploads.save_upload(
        session, data=b"ID3 fake audio", original_name="song.mp3",
        title="My Song", artist="Me", emotion="happy",
    )
    assert row.id is not None
    assert (uploads._uploads_path() / row.filename).is_file()
    listed = uploads.list_uploads(session)
    assert len(listed) == 1 and listed[0].title == "My Song"


def test_save_rejects_unsupported_type(session):
    with pytest.raises(uploads.UploadError):
        uploads.save_upload(
            session, data=b"x", original_name="virus.exe",
            title="", artist="", emotion="happy",
        )


def test_title_defaults_to_filename_stem(session):
    row = uploads.save_upload(
        session, data=b"x", original_name="cool track.wav",
        title="", artist="", emotion="neutral",
    )
    assert row.title == "cool track"
    assert row.artist == "You"


def test_delete_removes_file_and_row(session):
    row = uploads.save_upload(
        session, data=b"audio", original_name="a.wav",
        title="A", artist="", emotion="sad",
    )
    f = uploads._uploads_path() / row.filename
    assert uploads.delete_upload(session, row.id) is True
    assert not f.is_file()
    assert uploads.list_uploads(session) == []
    assert uploads.delete_upload(session, 999) is False  # missing id


def test_to_track_shape():
    row = UploadedTrack(id=5, title="T", artist="A", emotion="angry",
                        filename="x.mp3", duration=10)
    t = uploads.to_track(row)
    assert t["id"] == "upload:5"
    assert t["stream_url"] == "/uploads/x.mp3"
    assert t["mood"] == "angry"
    assert t["source"] == "local"


def test_uploads_for_emotion_surfaces_under_tag(session, monkeypatch):
    uploads.save_upload(session, data=b"a", original_name="h.mp3",
                        title="Happy", artist="", emotion="happy")
    uploads.save_upload(session, data=b"a", original_name="s.mp3",
                        title="Sad", artist="", emotion="sad")

    @contextmanager
    def fake_scope():
        yield session

    monkeypatch.setattr(uploads, "session_scope", fake_scope)

    # An upload lives in the album of the emotion it was tagged with.
    assert [t["title"] for t in uploads.uploads_for_emotion("sad")] == ["Sad"]
    assert [t["title"] for t in uploads.uploads_for_emotion("happy")] == ["Happy"]
