"""Minimal read-only Audius client: mood-filtered search + stream URLs.

Audius is a free, key-free music API (it authenticates with just an ``app_name``).
We resolve a healthy API host from the discovery endpoint, search tracks filtered
by mood (the ``mood=`` query param constrains results to that tag), and build
direct stream URLs an ``<audio>`` element can play (``/stream`` 302-redirects to a
signed file on a content node, which browsers follow transparently).
"""

from __future__ import annotations

import random
import time

import requests

from app.config import settings


class AudiusError(RuntimeError):
    """Raised when no Audius host could satisfy a request."""


_hosts: list[str] = []
_hosts_ts: float = 0.0
_HOSTS_TTL = 600.0  # re-resolve the host list every 10 minutes


# NOTE: the Audius REST read API authenticates with `app_name` only — there is no
# `api_key` query param for reads (the key is for the SDK / OAuth write flows). So
# we deliberately don't append settings.audius_api_key to REST calls.
def _params(extra: dict) -> dict:
    return {"app_name": settings.audius_app_name, **extra}


def hosts() -> list[str]:
    """Healthy Audius API hosts (cached). Falls back to the discovery URL itself."""
    global _hosts, _hosts_ts
    if _hosts and time.time() - _hosts_ts < _HOSTS_TTL:
        return _hosts
    found: list[str] = []
    try:
        r = requests.get(settings.audius_discovery, timeout=settings.audius_timeout)
        data = r.json().get("data") or []
        found = [h.rstrip("/") for h in data if isinstance(h, str) and h.startswith("http")]
        random.shuffle(found)  # spread load across nodes
    except Exception:  # noqa: BLE001 - any network/parse failure -> use discovery base
        found = []
    _hosts = found or [settings.audius_discovery.rstrip("/")]
    _hosts_ts = time.time()
    return _hosts


def stream_url(track_id: str) -> str:
    """A stable, directly-playable stream URL for a track id."""
    base = settings.audius_discovery.rstrip("/")
    return f"{base}/v1/tracks/{track_id}/stream?app_name={settings.audius_app_name}"


def search_by_mood(mood: str, limit: int) -> list[dict]:
    """Raw Audius track dicts tagged with ``mood``. Raises AudiusError if all hosts fail."""
    params = _params({"query": mood, "mood": mood, "limit": str(limit)})
    last_err: Exception | None = None
    for host in hosts():
        try:
            r = requests.get(
                f"{host}/v1/tracks/search", params=params, timeout=settings.audius_timeout
            )
            r.raise_for_status()
            return r.json().get("data") or []
        except Exception as exc:  # noqa: BLE001 - try the next host
            last_err = exc
    raise AudiusError(f"all Audius hosts failed: {last_err}")


def normalize(track: dict) -> dict | None:
    """Map a raw Audius track to our Track-schema dict, or None if unplayable."""
    tid = track.get("id")
    if not tid or track.get("is_delete") or track.get("is_streamable") is False:
        return None
    user = track.get("user") or {}
    art = track.get("artwork") or {}
    return {
        "id": str(tid),
        "title": track.get("title") or "Untitled",
        "artist": user.get("name") or user.get("handle") or "Unknown artist",
        "mood": track.get("mood") or "",
        "genre": track.get("genre") or "",
        "duration": int(track.get("duration") or 0),
        "stream_url": stream_url(str(tid)),
        "cover_url": art.get("480x480") or art.get("150x150") or "",
        "source": "audius",
    }
