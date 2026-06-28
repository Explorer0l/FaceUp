"""Favorites — like/unlike tracks and persist them to a collection.

A liked track is stored as a *snapshot* of the normalized Track shape (title,
artist, stream_url, ...) keyed by its cross-source id, so the Collection view can
list and replay favorites without re-querying Audius. Likes are idempotent: the
``track_id`` column is unique, so liking an already-liked track is a no-op.
"""

from __future__ import annotations

from sqlmodel import Session, select

from app.models import LikedTrack

# Optional Track fields we snapshot onto LikedTrack columns. ``id`` -> ``track_id``;
# ``title``/``stream_url`` are handled explicitly (required, with a title fallback).
_SNAPSHOT_FIELDS = ("artist", "mood", "genre", "duration", "cover_url", "source")


def like_track(session: Session, track: dict) -> LikedTrack:
    """Like a track (idempotent). Returns the stored row, existing or new."""
    track_id = str(track.get("id") or "").strip()
    if not track_id:
        raise ValueError("Track is missing an id.")
    stream_url = str(track.get("stream_url") or "").strip()
    if not stream_url:
        raise ValueError("Track is missing a stream_url.")

    existing = session.exec(
        select(LikedTrack).where(LikedTrack.track_id == track_id)
    ).first()
    if existing:
        return existing

    row = LikedTrack(
        track_id=track_id,
        title=str(track.get("title") or "Untitled"),
        stream_url=stream_url,
        **{f: track.get(f) for f in _SNAPSHOT_FIELDS if track.get(f) is not None},
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def unlike_track(session: Session, track_id: str) -> bool:
    """Remove a like. Returns True if a row was removed, False if it wasn't liked."""
    row = session.exec(
        select(LikedTrack).where(LikedTrack.track_id == track_id)
    ).first()
    if not row:
        return False
    session.delete(row)
    session.commit()
    return True


def list_likes(session: Session) -> list[LikedTrack]:
    """All liked tracks, most recently liked first."""
    return list(
        session.exec(select(LikedTrack).order_by(LikedTrack.created_at.desc()))
    )


def liked_ids(session: Session) -> list[str]:
    """Just the track ids — a cheap payload for syncing like-state on page load."""
    return list(session.exec(select(LikedTrack.track_id)))


def to_track(row: LikedTrack) -> dict:
    """Normalize a LikedTrack back to the shared Track shape (id from track_id)."""
    return {
        "id": row.track_id,
        "title": row.title,
        "artist": row.artist,
        "mood": row.mood,
        "genre": row.genre,
        "duration": row.duration,
        "stream_url": row.stream_url,
        "cover_url": row.cover_url,
        "source": row.source,
    }
