"""Usage stats (P6).

Currently tracks completed focus sessions: one ``FocusSession`` row per finished
timer. Durations are stored in seconds (timers can be sub-minute), and
``focus_summary`` aggregates them into totals plus a per-day breakdown for the
last N days (zero-filled so the chart always has a full week of bars).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app.models import FocusSession


def log_focus_session(session: Session, seconds: int) -> FocusSession:
    """Record a completed focus session of ``seconds`` length."""
    row = FocusSession(seconds=int(seconds))
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def focus_summary(session: Session, days: int = 7) -> dict:
    """Totals + a zero-filled per-day seconds breakdown for the last ``days`` days."""
    rows = list(session.exec(select(FocusSession)))
    total_seconds = sum(r.seconds for r in rows)

    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=days - 1)
    # Ordered date -> seconds buckets, one per day in the window (today last).
    buckets = {start + timedelta(days=i): 0 for i in range(days)}
    for r in rows:
        day = r.completed_at.date()
        if day in buckets:
            buckets[day] += r.seconds

    return {
        "total_seconds": total_seconds,
        "total_sessions": len(rows),
        "days": [
            {"date": day.isoformat(), "seconds": seconds}
            for day, seconds in buckets.items()
        ],
    }
