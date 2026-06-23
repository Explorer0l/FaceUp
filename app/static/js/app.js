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
    // Leaving the webcam tab should release the camera.
    if (name !== "webcam") stopCamera();
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
  // Only resize when needed — the webcam display loop calls this ~60×/sec and
  // reassigning width/height every frame would clear + thrash the canvas.
  if (overlay.width !== w || overlay.height !== h) {
    overlay.width = w;
    overlay.height = h;
  }
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

// The bar rows are built once and then updated in place. Rebuilding their DOM
// on every result (as webcam mode does ~5×/sec) would restart the CSS width
// transition each frame and look janky.
const barFills = {};
const barVals = {};
function ensureBars() {
  const bars = $("#bars");
  if (bars.childElementCount) return;
  for (const name of EMOTION_ORDER) {
    const row = document.createElement("div");
    row.className = "bar";
    row.innerHTML =
      `<span class="bar__name">${name}</span>` +
      `<span class="bar__track"><span class="bar__fill" style="background:${EMOTIONS[name].color}"></span></span>` +
      `<span class="bar__val">0%</span>`;
    bars.appendChild(row);
    barFills[name] = row.querySelector(".bar__fill");
    barVals[name] = row.querySelector(".bar__val");
  }
}

/** Populate the results panel from an API response. Safe to call repeatedly. */
function renderResults(data) {
  $("#result-error").hidden = true;
  const faces = data.faces || [];

  if (faces.length === 0) {
    $("#result-empty").hidden = true;
    $("#result-body").hidden = false;
    ensureBars();
    $("#dominant-emoji").textContent = "🔍";
    $("#dominant-label").textContent = "no face";
    $("#dominant-score").textContent = "—";
    for (const name of EMOTION_ORDER) {
      barFills[name].style.width = "0%";
      barVals[name].textContent = "0%";
    }
    $("#face-count").textContent = "0 faces";
    if (data.infer_ms != null) $("#infer-ms").textContent = `${data.infer_ms} ms`;
    return;
  }

  $("#result-empty").hidden = true;
  $("#result-body").hidden = false;
  ensureBars();

  // Use the most confident face for the headline figure.
  const primary = faces.reduce((a, b) =>
    (b.scores[b.dominant] ?? 0) > (a.scores[a.dominant] ?? 0) ? b : a
  );
  const conf = primary.scores[primary.dominant] ?? 0;
  $("#dominant-emoji").textContent = (EMOTIONS[primary.dominant] || EMOTIONS.neutral).emoji;
  $("#dominant-label").textContent = primary.dominant;
  $("#dominant-score").textContent = `${conf.toFixed(1)}% confidence`;

  for (const name of EMOTION_ORDER) {
    const val = primary.scores[name] ?? 0;
    barFills[name].style.width = `${Math.min(100, val)}%`;
    barVals[name].textContent = `${val.toFixed(1)}%`;
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

// ---- Webcam path ----------------------------------------------------------
// Two decoupled loops:
//   * displayLoop (requestAnimationFrame, ~60fps) draws the live video to the
//     stage and overlays the most recent detection boxes — always smooth.
//   * inferLoop (setInterval, ~5fps) ships one frame at a time to the backend.
//     A single in-flight guard drops frames instead of queuing them (Risk #3),
//     so a slow inference never builds a backlog.
const video = $("#webcam");
const camToggle = $("#cam-toggle");
const camStatus = $("#cam-status");
const captureCanvas = document.createElement("canvas");
const captureCtx = captureCanvas.getContext("2d");

const INFER_INTERVAL_MS = 200; // ~5 detections / second
let stream = null;
let rafId = null;
let inferTimer = null;
let inflight = false;
let latestFaces = [];

function displayLoop() {
  if (!stream) return;
  if (video.videoWidth) {
    drawOverlay(video, video.videoWidth, video.videoHeight, latestFaces);
  }
  rafId = requestAnimationFrame(displayLoop);
}

async function inferLoop() {
  if (!stream || inflight || !video.videoWidth) return;
  inflight = true;
  try {
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    captureCtx.drawImage(video, 0, 0);
    const dataURL = captureCanvas.toDataURL("image/jpeg", 0.7);
    const data = await analyzeDataURL(dataURL);
    latestFaces = data.faces || [];
    renderResults(data);
  } catch (e) {
    camStatus.textContent = `error: ${e.message}`;
  } finally {
    inflight = false;
  }
}

async function startCamera() {
  try {
    camStatus.textContent = "requesting camera…";
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    camToggle.textContent = "Stop camera";
    camToggle.classList.add("is-on");
    camStatus.textContent = "live";
    stage.classList.remove("is-empty");
    rafId = requestAnimationFrame(displayLoop);
    inferTimer = setInterval(inferLoop, INFER_INTERVAL_MS);
  } catch (e) {
    stream = null;
    const msg =
      e.name === "NotAllowedError" ? "camera permission denied"
      : e.name === "NotFoundError" ? "no camera found"
      : e.name === "NotReadableError" ? "camera is in use by another app"
      : e.message;
    camStatus.textContent = msg;
    showError(`Webcam error: ${msg}`);
  }
}

function stopCamera() {
  if (inferTimer) { clearInterval(inferTimer); inferTimer = null; }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  video.srcObject = null;
  inflight = false;
  latestFaces = [];
  camToggle.textContent = "Start camera";
  camToggle.classList.remove("is-on");
  camStatus.textContent = "camera off";
}

camToggle.addEventListener("click", () => {
  if (stream) stopCamera();
  else startCamera();
});

// Free the camera when the page is hidden/closed.
window.addEventListener("pagehide", stopCamera);

// ---- Boot -----------------------------------------------------------------
checkHealth();
