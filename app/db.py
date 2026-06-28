"""SQLite persistence via SQLModel.

A single shared engine over a SQLite file (path from settings). Reused by P3
uploads now and P6 stats later. ``init_db`` is called at app startup.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

from app import models  # noqa: F401 - import so tables register on SQLModel.metadata
from app.config import settings

_db_file = Path(settings.db_path)
# check_same_thread=False: FastAPI runs blocking DB work in a threadpool.
_engine = create_engine(
    f"sqlite:///{_db_file.as_posix()}",
    connect_args={"check_same_thread": False},
)


def init_db() -> None:
    """Create the database file + tables if they don't exist yet."""
    _db_file.parent.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(_engine)


@contextmanager
def session_scope() -> Iterator[Session]:
    """Context-managed session for service code outside the request lifecycle."""
    with Session(_engine) as session:
        yield session


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request."""
    with Session(_engine) as session:
        yield session
