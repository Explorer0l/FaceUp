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
