"""SQLModel tables.

``UploadedTrack`` backs the "Add songs" feature (P3): user-uploaded audio tagged
with one of our five emotions so it can join mood-matched recommendations.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class UploadedTrack(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str
    artist: str = "You"
    emotion: str = Field(index=True)  # one of the app's 5 classes
    filename: str  # stored file under settings.uploads_dir
    duration: int = 0  # seconds; 0 = unknown (the <audio> element knows at play time)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
