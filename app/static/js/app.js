"use strict";

/* ===========================================================================
 * FaceUp frontend
 * M3 implements the upload path. The analyse + render helpers
 * (analyzeDataURL / renderResults / drawOverlay) are written to be reused by
 * the webcam path in M4 — only the frame *source* differs.
 * ======================================================================== */

// Reduced, clearer set — must match the server's EMOTION_GROUPS keys/order.
const EMOTIONS = {
  happy:     { emoji: "😄", color: "#ffd24a" },
  sad:       { emoji: "😢", color: "#5aa9ff" },
  angry:     { emoji: "😠", color: "#ff5c5c" },
  surprised: { emoji: "😲", color: "#ff9f43" },
  neutral:   { emoji: "😐", color: "#9aa0a6" },
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
      el.textContent = `ready · cam:${data.detector_webcam} · img:${data.detector_upload}`;
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
/** POST a data-URL/base64 image to the API. Returns {faces, infer_ms}.
 *  `mode` ("upload"|"webcam") selects the server-side detector backend. */
async function analyzeDataURL(dataURL, mode = "upload") {
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

// ---- Rendering ------------------------------------------------------------
/** Draw the source (image or video frame) plus detection boxes onto #overlay.
 *  `source` is anything drawImage accepts; w/h are its natural pixel size. */
function drawOverlay(source, w, h, faces, mirror = false) {
  // Only resize when needed — the webcam display loop calls this ~60×/sec and
  // reassigning width/height every frame would clear + thrash the canvas.
  if (overlay.width !== w || overlay.height !== h) {
    overlay.width = w;
    overlay.height = h;
  }
  // Mirror only the video pixels (selfie view); boxes/labels are positioned
  // manually below so the text never comes out reversed.
  if (mirror) {
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(source, 0, 0, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(source, 0, 0, w, h);
  }

  const lineW = Math.max(2, Math.round(w / 250));
  ctx.lineWidth = lineW;
  ctx.font = `${Math.max(14, Math.round(w / 38))}px system-ui, sans-serif`;
  ctx.textBaseline = "top";

  for (const f of faces) {
    const { y, w: bw, h: bh } = f.box;
    // When mirrored, flip the box x to match the mirrored video.
    const x = mirror ? w - (f.box.x + bw) : f.box.x;

    // `_view` lets the webcam path show the *smoothed* label (or "analyzing…")
    // instead of the raw per-frame dominant. Upload faces have no _view.
    const view = f._view ?? {
      emotion: f.dominant,
      score: f.scores[f.dominant] ?? 0,
      analyzing: false,
    };
    const color = view.analyzing
      ? "#9aa0a6"
      : (EMOTIONS[view.emotion] || EMOTIONS.neutral).color;
    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, bw, bh);

    const label = view.analyzing
      ? "⏳ analyzing…"
      : `${(EMOTIONS[view.emotion] || EMOTIONS.neutral).emoji} ${view.emotion} ${view.score.toFixed(0)}%`;
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
      const data = await analyzeDataURL(dataURL, "upload");
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
    drawOverlay(video, video.videoWidth, video.videoHeight, latestFaces, mirror);
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
    const data = await analyzeDataURL(dataURL, "webcam");
    trackFps();
    lastMs = data.infer_ms;
    handleWebcamResult(data);
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
    resetFps();
    resetSmoothing();
    $("#hud").hidden = false;
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
  resetSmoothing();
  $("#hud").hidden = true;
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

// ---- Mirror toggle (selfie view) ------------------------------------------
let mirror = true; // mirrored by default — feels natural like a selfie camera
const mirrorToggle = $("#cam-mirror");
mirrorToggle.addEventListener("click", () => {
  mirror = !mirror;
  mirrorToggle.classList.toggle("is-active", mirror);
  mirrorToggle.textContent = mirror ? "Mirror: on" : "Mirror: off";
});

// ---- FPS / latency HUD ----------------------------------------------------
// fpsEMA is an exponential moving average of the *actual* completed-inference
// rate, so it reflects real throughput (which drops if the CPU is busy), not
// the nominal 5fps target.
let fpsEMA = 0;
let lastFpsTs = 0;
let lastMs = 0;
function resetFps() { fpsEMA = 0; lastFpsTs = 0; lastMs = 0; }
function trackFps() {
  const now = performance.now();
  if (lastFpsTs) {
    const inst = 1000 / Math.max(1, now - lastFpsTs);
    fpsEMA = fpsEMA ? fpsEMA * 0.7 + inst * 0.3 : inst;
  }
  lastFpsTs = now;
}
function setHud(color, status) {
  $("#hud-dot").style.background = color;
  $("#hud-status").textContent = status;
  $("#hud-meta").textContent = `${fpsEMA.toFixed(1)} fps · ${lastMs} ms`;
}

// ---- Temporal smoothing (webcam) ------------------------------------------
// Instead of announcing each frame's raw guess (which flickers and looks
// inaccurate), we collect the last ~1.5s of score vectors, average them, and
// only announce once enough data is in — then switch the announced emotion only
// when a challenger clearly overtakes the incumbent (hysteresis). The reading
// settles on a stable, more trustworthy result.
const SMOOTH_WINDOW_MS = 1500; // averaging window
const SMOOTH_MIN_MS = 700;     // collect at least this much before announcing
const SWITCH_MARGIN = 6;       // challenger must lead incumbent by this many %
let scoreBuffer = [];          // [{ t, scores }]
let announced = null;          // currently announced emotion

function resetSmoothing() {
  scoreBuffer = [];
  announced = null;
}

function smoothedScores() {
  const avg = {};
  for (const name of EMOTION_ORDER) avg[name] = 0;
  for (const s of scoreBuffer)
    for (const name of EMOTION_ORDER) avg[name] += s.scores[name] ?? 0;
  const n = scoreBuffer.length || 1;
  for (const name of EMOTION_ORDER) avg[name] /= n;
  return avg;
}

function pickAnnounced(avg) {
  let top = EMOTION_ORDER[0];
  for (const name of EMOTION_ORDER) if (avg[name] > avg[top]) top = name;
  // Keep the incumbent unless the challenger leads it by the margin.
  if (announced && top !== announced && avg[top] - avg[announced] < SWITCH_MARGIN) {
    return announced;
  }
  announced = top;
  return announced;
}

function handleWebcamResult(data) {
  const faces = data.faces || [];
  const primary = faces.length
    ? faces.reduce((a, b) => ((b.scores[b.dominant] ?? 0) > (a.scores[a.dominant] ?? 0) ? b : a))
    : null;

  if (!primary) {
    resetSmoothing();
    latestFaces = [];
    setHud("#9aa0a6", "searching…");
    renderSmoothedPanel({ kind: "noface" });
    return;
  }

  const now = performance.now();
  scoreBuffer.push({ t: now, scores: primary.scores });
  while (scoreBuffer.length && scoreBuffer[0].t < now - SMOOTH_WINDOW_MS) {
    scoreBuffer.shift();
  }

  const span = scoreBuffer.length > 1 ? now - scoreBuffer[0].t : 0;
  const avg = smoothedScores();
  latestFaces = faces; // keep all boxes; the primary carries the label below

  if (span >= SMOOTH_MIN_MS) {
    const dom = pickAnnounced(avg);
    primary._view = { emotion: dom, score: avg[dom], analyzing: false };
    setHud((EMOTIONS[dom] || EMOTIONS.neutral).color, `${dom} · stable`);
    renderSmoothedPanel({ kind: "ready", avg, dom, faceCount: faces.length });
  } else {
    primary._view = { analyzing: true };
    setHud("#ffd24a", "analyzing…");
    renderSmoothedPanel({ kind: "analyzing", avg, faceCount: faces.length });
  }
}

/** Render the results panel from smoothed (time-averaged) webcam scores. */
function renderSmoothedPanel({ kind, avg, dom, faceCount }) {
  $("#result-error").hidden = true;
  $("#result-empty").hidden = true;
  $("#result-body").hidden = false;
  ensureBars();

  if (kind === "noface") {
    $("#dominant-emoji").textContent = "🔍";
    $("#dominant-label").textContent = "no face";
    $("#dominant-score").textContent = "—";
    for (const n of EMOTION_ORDER) {
      barFills[n].style.width = "0%";
      barVals[n].textContent = "0%";
    }
    $("#face-count").textContent = "0 faces";
    $("#infer-ms").textContent = `${lastMs} ms`;
    return;
  }

  // analyzing + ready both show the averaged bars (so you watch it converge).
  for (const n of EMOTION_ORDER) {
    const v = avg[n] ?? 0;
    barFills[n].style.width = `${Math.min(100, v)}%`;
    barVals[n].textContent = `${v.toFixed(1)}%`;
  }
  $("#face-count").textContent = `${faceCount} face${faceCount > 1 ? "s" : ""}`;
  $("#infer-ms").textContent = `${lastMs} ms`;

  if (kind === "analyzing") {
    $("#dominant-emoji").textContent = "⏳";
    $("#dominant-label").textContent = "analyzing…";
    $("#dominant-score").textContent = "hold still a moment";
  } else {
    $("#dominant-emoji").textContent = (EMOTIONS[dom] || EMOTIONS.neutral).emoji;
    $("#dominant-label").textContent = dom;
    $("#dominant-score").textContent = `${(avg[dom] ?? 0).toFixed(1)}% (smoothed)`;
  }
}

// ---- Boot -----------------------------------------------------------------
checkHealth();
