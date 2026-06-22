"use strict";

/* ===========================================================================
 * FaceUp frontend
 * M3 implements the upload path. The analyse + render helpers
 * (analyzeDataURL / renderResults / drawOverlay) are written to be reused by
 * the webcam path in M4 — only the frame *source* differs.
 * ======================================================================== */

const EMOTIONS = {
  angry:    { emoji: "😠", color: "#ff5c5c" },
  disgust:  { emoji: "🤢", color: "#7bcf6a" },
  fear:     { emoji: "😨", color: "#b58bff" },
  happy:    { emoji: "😄", color: "#ffd24a" },
  sad:      { emoji: "😢", color: "#5aa9ff" },
  surprise: { emoji: "😲", color: "#ff9f43" },
  neutral:  { emoji: "😐", color: "#9aa0a6" },
};
const EMOTION_ORDER = Object.keys(EMOTIONS);

// ---- DOM ------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const overlay = $("#overlay");
const ctx = overlay.getContext("2d");
const stage = $("#stage");

// ---- Server status --------------------------------------------------------
async function checkHealth() {
  const el = $("#server-status");
  try {
    const data = await (await fetch("/health")).json();
    if (data.model_ready) {
      el.textContent = `ready · ${data.detector_backend}`;
      el.className = "pill pill--ok";
    } else {
      el.textContent = "warming up…";
      el.className = "pill pill--warn";
      setTimeout(checkHealth, 1500);
    }
  } catch {
    el.textContent = "offline";
    el.className = "pill pill--err";
  }
}

// ---- Tabs -----------------------------------------------------------------
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const name = tab.dataset.tab;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t === tab));
    document.querySelectorAll(".tabpanel").forEach((p) =>
      p.classList.toggle("is-active", p.dataset.panel === name)
    );
  });
});

// ---- Core: call the backend ----------------------------------------------
/** POST a data-URL/base64 image to the API. Returns {faces, infer_ms}. */
async function analyzeDataURL(dataURL) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataURL }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Server error (${res.status})`);
  }
  return res.json();
}

// ---- Rendering ------------------------------------------------------------
/** Draw the source (image or video frame) plus detection boxes onto #overlay.
 *  `source` is anything drawImage accepts; w/h are its natural pixel size. */
function drawOverlay(source, w, h, faces) {
  overlay.width = w;
  overlay.height = h;
  ctx.drawImage(source, 0, 0, w, h);

  const lineW = Math.max(2, Math.round(w / 250));
  ctx.lineWidth = lineW;
  ctx.font = `${Math.max(14, Math.round(w / 38))}px system-ui, sans-serif`;
  ctx.textBaseline = "top";

  for (const f of faces) {
    const { x, y, w: bw, h: bh } = f.box;
    const color = (EMOTIONS[f.dominant] || EMOTIONS.neutral).color;
    const emoji = (EMOTIONS[f.dominant] || EMOTIONS.neutral).emoji;
    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, bw, bh);

    const score = f.scores[f.dominant] ?? 0;
    const label = `${emoji} ${f.dominant} ${score.toFixed(0)}%`;
    const pad = lineW * 2;
    const tw = ctx.measureText(label).width + pad * 2;
    const th = parseInt(ctx.font, 10) + pad;
    const ly = y - th < 0 ? y + bh : y - th; // flip below box if no room above
    ctx.fillStyle = color;
    ctx.fillRect(x - lineW / 2, ly, tw, th);
    ctx.fillStyle = "#0f1115";
    ctx.fillText(label, x + pad, ly + pad / 2);
  }
  stage.classList.remove("is-empty");
}

/** Populate the results panel from an API response. */
function renderResults(data) {
  $("#result-error").hidden = true;
  const faces = data.faces || [];

  if (faces.length === 0) {
    $("#result-body").hidden = true;
    const empty = $("#result-empty");
    empty.hidden = false;
    empty.textContent = "No face detected — try another image or angle.";
    return;
  }

  $("#result-empty").hidden = true;
  $("#result-body").hidden = false;

  // Use the most confident face for the headline figure.
  const primary = faces.reduce((a, b) =>
    (b.scores[b.dominant] ?? 0) > (a.scores[a.dominant] ?? 0) ? b : a
  );
  const conf = primary.scores[primary.dominant] ?? 0;
  $("#dominant-emoji").textContent = (EMOTIONS[primary.dominant] || EMOTIONS.neutral).emoji;
  $("#dominant-label").textContent = primary.dominant;
  $("#dominant-score").textContent = `${conf.toFixed(1)}% confidence`;

  const bars = $("#bars");
  bars.innerHTML = "";
  for (const name of EMOTION_ORDER) {
    const val = primary.scores[name] ?? 0;
    const row = document.createElement("div");
    row.className = "bar";
    row.innerHTML =
      `<span class="bar__name">${name}</span>` +
      `<span class="bar__track"><span class="bar__fill" style="background:${EMOTIONS[name].color}"></span></span>` +
      `<span class="bar__val">${val.toFixed(1)}%</span>`;
    bars.appendChild(row);
    // animate width on next frame
    requestAnimationFrame(() => {
      row.querySelector(".bar__fill").style.width = `${Math.min(100, val)}%`;
    });
  }

  $("#face-count").textContent = `${faces.length} face${faces.length > 1 ? "s" : ""}`;
  $("#infer-ms").textContent = `${data.infer_ms} ms`;
}

function showError(message) {
  $("#result-body").hidden = true;
  $("#result-empty").hidden = true;
  const err = $("#result-error");
  err.hidden = false;
  err.textContent = message;
}

// ---- Upload path ----------------------------------------------------------
function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    showError("Please choose an image file.");
    return;
  }
  const img = new Image();
  img.onload = async () => {
    URL.revokeObjectURL(img.src);
    // Draw immediately so the user sees the image while we analyse.
    drawOverlay(img, img.naturalWidth, img.naturalHeight, []);
    try {
      const dataURL = overlay.toDataURL("image/jpeg", 0.92);
      const data = await analyzeDataURL(dataURL);
      drawOverlay(img, img.naturalWidth, img.naturalHeight, data.faces || []);
      renderResults(data);
    } catch (e) {
      showError(e.message);
    }
  };
  img.onerror = () => showError("Could not read that image.");
  img.src = URL.createObjectURL(file);
}

const fileInput = $("#file-input");
const dropzone = $("#dropzone");
fileInput.addEventListener("change", (e) => loadFile(e.target.files[0]));

["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("is-drag");
  })
);
["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-drag");
  })
);
dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) loadFile(file);
});

// ---- Boot -----------------------------------------------------------------
checkHealth();
