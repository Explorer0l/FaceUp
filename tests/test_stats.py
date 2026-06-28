"""Tests for the Stats service (P6) — focus-session logging + aggregation."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.models import FocusSession
from app.services import stats


@pytest.fixture
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def test_log_focus_session_persists(session):
    row = stats.log_focus_session(session, 25)
    assert row.id is not None and row.minutes == 25


def test_summary_totals(session):
    stats.log_focus_session(session, 25)
    stats.log_focus_session(session, 50)
    summary = stats.focus_summary(session)
    assert summary["total_minutes"] == 75
    assert summary["total_sessions"] == 2


def test_summary_has_zero_filled_week(session):
    summary = stats.focus_summary(session, days=7)
    assert len(summary["days"]) == 7
    assert all(d["minutes"] == 0 for d in summary["days"])
    # Days are ordered oldest -> newest (today last).
    dates = [d["date"] for d in summary["days"]]
    assert dates == sorted(dates)
    assert summary["total_minutes"] == 0 and summary["total_sessions"] == 0


def test_summary_buckets_minutes_by_day(session):
    today = datetime.now(timezone.utc)
    # Two sessions today, one two days ago, one outside the 7-day window.
    session.add(FocusSession(minutes=25, completed_at=today))
    session.add(FocusSession(minutes=5, completed_at=today))
    session.add(FocusSession(minutes=50, completed_at=today - timedelta(days=2)))
    session.add(FocusSession(minutes=99, completed_at=today - timedelta(days=30)))
    session.commit()

    summary = stats.focus_summary(session, days=7)
    by_date = {d["date"]: d["minutes"] for d in summary["days"]}
    assert by_date[today.date().isoformat()] == 30  # 25 + 5
    assert by_date[(today - timedelta(days=2)).date().isoformat()] == 50
    # The 30-day-old session counts in totals but not in the 7-day chart.
    assert summary["total_minutes"] == 179
    assert sum(by_date.values()) == 80
