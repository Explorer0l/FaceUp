"""SQLite persistence via SQLModel.

A single shared engine over a SQLite file (path from settings). Reused by P3
uploads now and P6 stats later. ``init_db`` is called at app startup.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from app import models  # noqa: F401 - import so tables register on SQLModel.metadata
from app.config import settings

_db_file = Path(settings.db_path)
# check_same_thread=False: FastAPI runs blocking DB work in a threadpool.
_engine = create_engine(
    f"sqlite:///{_db_file.as_posix()}",
    connect_args={"check_same_thread": False},
)

# Columns added to a model *after* its table was first created. SQLModel's
# create_all only creates missing tables, never alters existing ones, so we add
# these in place on startup — a tiny forward-migration that keeps the dev DB and
# its data intact without pulling in a full migration tool (e.g. Alembic).
_ADDED_COLUMNS: dict[str, dict[str, str]] = {
    "uploadedtrack": {"cover_filename": "VARCHAR"},
}


def _apply_additive_migrations() -> None:
    inspector = inspect(_engine)
    tables = set(inspector.get_table_names())
    with _engine.begin() as conn:
        for table, columns in _ADDED_COLUMNS.items():
            if table not in tables:
                continue  # fresh DB: create_all already made the full table
            present = {col["name"] for col in inspector.get_columns(table)}
            for name, ddl in columns.items():
                if name not in present:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


def _migrate_focussession_to_seconds() -> None:
    """Convert the legacy ``focussession.minutes`` column to ``seconds`` (× 60).

    FocusSession first stored whole minutes; second-precision timers need
    seconds. create_all can't alter an existing table, so we add ``seconds``,
    backfill from ``minutes * 60`` (no data lost), and drop the old column.
    """
    inspector = inspect(_engine)
    if "focussession" not in inspector.get_table_names():
        return  # fresh DB: create_all already made the seconds schema
    cols = {c["name"] for c in inspector.get_columns("focussession")}
    if "seconds" in cols or "minutes" not in cols:
        return  # already migrated
    with _engine.begin() as conn:
        conn.execute(text("ALTER TABLE focussession ADD COLUMN seconds INTEGER"))
        conn.execute(text("UPDATE focussession SET seconds = minutes * 60"))
        try:  # DROP COLUMN needs SQLite >= 3.35; leaving it is harmless otherwise
            conn.execute(text("ALTER TABLE focussession DROP COLUMN minutes"))
        except Exception:  # noqa: BLE001
            pass


def init_db() -> None:
    """Create the database file + tables, then apply schema migrations."""
    _db_file.parent.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(_engine)
    _apply_additive_migrations()
    _migrate_focussession_to_seconds()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Context-managed session for service code outside the request lifecycle."""
    with Session(_engine) as session:
        yield session


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request."""
    with Session(_engine) as session:
        yield session
