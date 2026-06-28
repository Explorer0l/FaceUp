"""User-uploaded tracks (P3): save files + rows, list, delete, surface in recos.

Uploaded audio is stored under ``settings.uploads_dir`` (gitignored) with a random
filename; metadata lives in SQLite. A track tagged with an emotion surfaces in
recommendations when the vibe matches: Match -> same emotion, Lift -> the lift
target (e.g. a 'happy' upload plays for sad/Lift). Uploads normalize to the same
Track shape as Audius tracks (source = "local").
"""

from __future__ import annotations

import time
import uuid
from pathlib import Path

from sqlmodel import Session, select

from app.config import settings
from app.db import session_scope
from app.models import UploadedTrack
from app.services.music.moods import lift_target

ALLOWED_EXT = {".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"}


class UploadError(ValueError):
    """Raised when an upload can't be accepted (e.g. unsupported type)."""


def _uploads_path() -> Path:
    p = Path(settings.uploads_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


def save_upload(
    session: Session, *, data: bytes, original_name: str,
    title: str, artist: str, emotion: str, duration: int = 0,
) -> UploadedTrack:
    ext = Path(original_name or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise UploadError(f"Unsupported audio type '{ext or '?'}'.")
    fname = f"{uuid.uuid4().hex}{ext}"
    (_uploads_path() / fname).write_bytes(data)

    row = UploadedTrack(
        title=(title or "").strip() or Path(original_name).stem or "Untitled",
        artist=(artist or "").strip() or "You",
        emotion=emotion,
        filename=fname,
        duration=duration,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def list_uploads(session: Session) -> list[UploadedTrack]:
    return list(
        session.exec(select(UploadedTrack).order_by(UploadedTrack.created_at.desc()))
    )


def _remove_file(path: Path, *, retries: int = 5, delay: float = 0.2) -> bool:
    """Best-effort unlink that tolerates a transient Windows share-lock.

    A file streamed by StaticFiles to a still-open <audio> element keeps an OS
    handle until the browser drops the connection. Retry briefly, then give up
    (the DB row is already gone, so a stray file is harmless and reclaimable).
    """
    for attempt in range(retries):
        try:
            path.unlink(missing_ok=True)
            return True
        except PermissionError:
            if attempt == retries - 1:
                return False
            time.sleep(delay)
    return False


def delete_upload(session: Session, track_id: int) -> bool:
    row = session.get(UploadedTrack, track_id)
    if not row:
        return False
    f = _uploads_path() / row.filename
    # Drop the row first so the track leaves the UI even if the file is locked
    # for a moment; then release the file best-effort.
    session.delete(row)
    session.commit()
    _remove_file(f)
    return True


def to_track(row: UploadedTrack) -> dict:
    """Normalize an UploadedTrack to the shared Track shape."""
    return {
        "id": f"upload:{row.id}",
        "title": row.title,
        "artist": row.artist,
        "mood": row.emotion,
        "genre": "Your upload",
        "duration": row.duration,
        "stream_url": f"/uploads/{row.filename}",
        "cover_url": "",
        "source": "local",
    }


def uploads_for_emotion(emotion: str, mode: str) -> list[dict]:
    """Track dicts for uploads matching this vibe. Opens its own DB session."""
    target = (emotion or "").lower() if mode == "match" else lift_target(emotion)
    with session_scope() as session:
        rows = session.exec(
            select(UploadedTrack).where(UploadedTrack.emotion == target)
        )
        return [to_track(r) for r in rows]
