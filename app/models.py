"""SQLModel tables.

``UploadedTrack`` backs the "Add songs" feature (P3): user-uploaded audio tagged
with one of our emotions so it can join mood-matched recommendations.

``LikedTrack`` backs the Favorites collection: a snapshot of any track the user
likes (Audius or local upload), so it stays listable/playable without re-querying
Audius. Keyed by the track's source id (``track_id``) for idempotent likes.

``FocusSession`` backs the Stats page (P6): one row per completed focus timer,
used to total focus minutes/sessions and chart activity per day.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class UploadedTrack(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str
    artist: str = "You"
    emotion: str = Field(index=True)  # one of the app's emotion classes
    filename: str  # stored audio file under settings.uploads_dir
    # optional custom cover image, stored under settings.uploads_dir/covers
    cover_filename: str | None = None
    duration: int = 0  # seconds; 0 = unknown (the <audio> element knows at play time)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class LikedTrack(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    # The track's cross-source id, e.g. "QbW6OE9" (Audius) or "upload:1" (local).
    # Unique so liking the same track twice is a no-op.
    track_id: str = Field(index=True, unique=True)
    title: str
    artist: str = ""
    mood: str = ""
    genre: str = ""
    duration: int = 0
    stream_url: str
    cover_url: str = ""
    source: str = "audius"  # "audius" | "local"
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class FocusSession(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    seconds: int  # length of the completed focus session, in seconds
    completed_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), index=True
    )
