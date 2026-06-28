// Thin wrapper over the backend HTTP API.

export async function getHealth() {
  return (await fetch("/health")).json();
}

export async function getModels() {
  return (await fetch("/api/models")).json();
}

/** Mood-matched tracks for an emotion. `mode` is "match" (mirror) or "lift". */
export async function getRecommendations(emotion, mode = "match", limit = 18) {
  const q = new URLSearchParams({ emotion, mode, limit: String(limit) });
  const res = await fetch(`/api/recommend?${q}`);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Recommend failed (${res.status})`);
  }
  return res.json();
}

/** List the user's uploaded tracks (newest first). */
export async function listUploads() {
  return (await fetch("/api/uploads")).json();
}

/** Upload an audio file with metadata. `form` is a FormData (file, title, artist, emotion). */
export async function uploadTrack(form) {
  const res = await fetch("/api/uploads", { method: "POST", body: form });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Upload failed (${res.status})`);
  }
  return res.json();
}

/** Delete an uploaded track by id. */
export async function deleteUpload(id) {
  const res = await fetch(`/api/uploads/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
  return res.json();
}

/** List liked tracks (newest first), each in the shared Track shape. */
export async function listLikes() {
  return (await fetch("/api/likes")).json();
}

/** The ids of liked tracks — a light payload for syncing like-state on load. */
export async function likedIds() {
  return (await fetch("/api/likes/ids")).json();
}

/** Like a track. `track` is a Track object (id, title, stream_url, ...). */
export async function likeTrack(track) {
  const res = await fetch("/api/likes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(track),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Like failed (${res.status})`);
  }
  return res.json();
}

/** Remove a like by track id. */
export async function unlikeTrack(trackId) {
  const res = await fetch(`/api/likes/${encodeURIComponent(trackId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Unlike failed (${res.status})`);
  return res.json();
}

/** Focus-session stats: totals + per-day minutes. */
export async function getFocusStats() {
  return (await fetch("/api/stats/focus")).json();
}

/** Log a completed focus session of `minutes`; returns the updated stats. */
export async function logFocusSession(minutes) {
  const res = await fetch("/api/stats/focus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minutes }),
  });
  if (!res.ok) throw new Error(`Stats log failed (${res.status})`);
  return res.json();
}

/** POST a data-URL/base64 image. `mode` picks the detector; `model` the engine. */
export async function analyzeDataURL(dataURL, mode = "upload", model = "deepface") {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataURL, mode, model }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Server error (${res.status})`);
  }
  return res.json();
}
