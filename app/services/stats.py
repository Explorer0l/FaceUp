"""Usage stats (P6).

Currently tracks completed focus sessions: one ``FocusSession`` row per finished
timer. ``focus_summary`` aggregates these into totals plus a per-day breakdown
for the last N days (zero-filled so the chart always has a full week of bars).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app.models import FocusSession


def log_focus_session(session: Session, minutes: int) -> FocusSession:
    """Record a completed focus session of ``minutes`` length."""
    row = FocusSession(minutes=int(minutes))
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def focus_summary(session: Session, days: int = 7) -> dict:
    """Totals + a zero-filled per-day minute breakdown for the last ``days`` days."""
    rows = list(session.exec(select(FocusSession)))
    total_minutes = sum(r.minutes for r in rows)

    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=days - 1)
    # Ordered date -> minutes buckets, one per day in the window (today last).
    buckets = {start + timedelta(days=i): 0 for i in range(days)}
    for r in rows:
        day = r.completed_at.date()
        if day in buckets:
            buckets[day] += r.minutes

    return {
        "total_minutes": total_minutes,
        "total_sessions": len(rows),
        "days": [
            {"date": day.isoformat(), "minutes": minutes}
            for day, minutes in buckets.items()
        ],
    }
