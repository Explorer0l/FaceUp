// Thin wrapper over the backend HTTP API.

export async function getHealth() {
  return (await fetch("/health")).json();
}

/** POST a data-URL/base64 image. `mode` selects the detector backend. */
export async function analyzeDataURL(dataURL, mode = "upload") {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataURL, mode }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Server error (${res.status})`);
  }
  return res.json();
}
