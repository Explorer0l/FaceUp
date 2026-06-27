// Thin wrapper over the backend HTTP API.

export async function getHealth() {
  return (await fetch("/health")).json();
}

export async function getModels() {
  return (await fetch("/api/models")).json();
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
