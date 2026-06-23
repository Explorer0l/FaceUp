// Mood-scan view: the facial-emotion engine (webcam + upload) from earlier
// milestones, modularised. It emits "emotion" on the bus whenever it has a
// confident reading, so the Vibe view can react.
import { EMOTIONS, EMOTION_ORDER } from "./emotions.js";
import { analyzeDataURL } from "./api.js";
import { emit, on } from "./bus.js";

const $ = (s) => document.querySelector(s);

let overlay, ctx, stage, video, captureCanvas, captureCtx;

// ---- Overlay drawing ------------------------------------------------------
function drawOverlay(source, w, h, faces, mirror = false) {
  if (overlay.width !== w || overlay.height !== h) {
    overlay.width = w;
    overlay.height = h;
  }
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
    const x = mirror ? w - (f.box.x + bw) : f.box.x;
    const view = f._view ?? {
      emotion: f.dominant,
      score: f.scores[f.dominant] ?? 0,
      analyzing: false,
    };
    const color = view.analyzing ? "#9aa0a6" : (EMOTIONS[view.emotion] || EMOTIONS.neutral).color;
    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, bw, bh);

    const label = view.analyzing
      ? "⏳ analyzing…"
      : `${(EMOTIONS[view.emotion] || EMOTIONS.neutral).emoji} ${view.emotion} ${view.score.toFixed(0)}%`;
    const pad = lineW * 2;
    const tw = ctx.measureText(label).width + pad * 2;
    const th = parseInt(ctx.font, 10) + pad;
    const ly = y - th < 0 ? y + bh : y - th;
    ctx.fillStyle = color;
    ctx.fillRect(x - lineW / 2, ly, tw, th);
    ctx.fillStyle = "#0f1115";
    ctx.fillText(label, x + pad, ly + pad / 2);
  }
  stage.classList.remove("is-empty");
}

// ---- Results panel --------------------------------------------------------
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

function announceEmotion(name) {
  $("#to-vibe").hidden = false;
  emit("emotion", { emotion: name });
}

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
  announceEmotion(primary.dominant);
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

// ---- Webcam path ----------------------------------------------------------
const INFER_INTERVAL_MS = 200;
let stream = null;
let rafId = null;
let inferTimer = null;
let inflight = false;
let latestFaces = [];
let mirror = true;

function displayLoop() {
  if (!stream) return;
  if (video.videoWidth) drawOverlay(video, video.videoWidth, video.videoHeight, latestFaces, mirror);
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
    $("#cam-status").textContent = `error: ${e.message}`;
  } finally {
    inflight = false;
  }
}

async function startCamera() {
  try {
    $("#cam-status").textContent = "requesting camera…";
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    video.srcObject = stream;
    await video.play();
    $("#cam-toggle").textContent = "Stop camera";
    $("#cam-toggle").classList.add("is-on");
    $("#cam-status").textContent = "live";
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
    $("#cam-status").textContent = msg;
    showError(`Webcam error: ${msg}`);
  }
}

function stopCamera() {
  if (inferTimer) { clearInterval(inferTimer); inferTimer = null; }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  if (video) video.srcObject = null;
  inflight = false;
  latestFaces = [];
  resetSmoothing();
  $("#hud").hidden = true;
  $("#cam-toggle").textContent = "Start camera";
  $("#cam-toggle").classList.remove("is-on");
  $("#cam-status").textContent = "camera off";
}

// ---- FPS / HUD ------------------------------------------------------------
let fpsEMA = 0, lastFpsTs = 0, lastMs = 0;
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

// ---- Temporal smoothing ---------------------------------------------------
const SMOOTH_WINDOW_MS = 1500, SMOOTH_MIN_MS = 700, SWITCH_MARGIN = 6;
let scoreBuffer = [], announced = null;
function resetSmoothing() { scoreBuffer = []; announced = null; }
function smoothedScores() {
  const avg = {};
  for (const n of EMOTION_ORDER) avg[n] = 0;
  for (const s of scoreBuffer) for (const n of EMOTION_ORDER) avg[n] += s.scores[n] ?? 0;
  const k = scoreBuffer.length || 1;
  for (const n of EMOTION_ORDER) avg[n] /= k;
  return avg;
}
function pickAnnounced(avg) {
  let top = EMOTION_ORDER[0];
  for (const n of EMOTION_ORDER) if (avg[n] > avg[top]) top = n;
  if (announced && top !== announced && avg[top] - avg[announced] < SWITCH_MARGIN) return announced;
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
  while (scoreBuffer.length && scoreBuffer[0].t < now - SMOOTH_WINDOW_MS) scoreBuffer.shift();
  const span = scoreBuffer.length > 1 ? now - scoreBuffer[0].t : 0;
  const avg = smoothedScores();
  latestFaces = faces;

  if (span >= SMOOTH_MIN_MS) {
    const dom = pickAnnounced(avg);
    primary._view = { emotion: dom, score: avg[dom], analyzing: false };
    setHud((EMOTIONS[dom] || EMOTIONS.neutral).color, `${dom} · stable`);
    renderSmoothedPanel({ kind: "ready", avg, dom, faceCount: faces.length });
    announceEmotion(dom);
  } else {
    primary._view = { analyzing: true };
    setHud("#ffd24a", "analyzing…");
    renderSmoothedPanel({ kind: "analyzing", avg, faceCount: faces.length });
  }
}
function renderSmoothedPanel({ kind, avg, dom, faceCount }) {
  $("#result-error").hidden = true;
  $("#result-empty").hidden = true;
  $("#result-body").hidden = false;
  ensureBars();
  if (kind === "noface") {
    $("#dominant-emoji").textContent = "🔍";
    $("#dominant-label").textContent = "no face";
    $("#dominant-score").textContent = "—";
    for (const n of EMOTION_ORDER) { barFills[n].style.width = "0%"; barVals[n].textContent = "0%"; }
    $("#face-count").textContent = "0 faces";
    $("#infer-ms").textContent = `${lastMs} ms`;
    return;
  }
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

// ---- Init -----------------------------------------------------------------
export function initMoodScan() {
  overlay = $("#overlay");
  ctx = overlay.getContext("2d");
  stage = $("#stage");
  video = $("#webcam");
  captureCanvas = document.createElement("canvas");
  captureCtx = captureCanvas.getContext("2d");

  // Upload / webcam sub-tabs
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t === tab));
      document.querySelectorAll(".tabpanel").forEach((p) =>
        p.classList.toggle("is-active", p.dataset.panel === name)
      );
      if (name !== "webcam") stopCamera();
    });
  });

  // Upload
  $("#file-input").addEventListener("change", (e) => loadFile(e.target.files[0]));
  const dz = $("#dropzone");
  ["dragenter", "dragover"].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-drag"); })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-drag"); })
  );
  dz.addEventListener("drop", (e) => { const f = e.dataTransfer?.files?.[0]; if (f) loadFile(f); });

  // Webcam
  $("#cam-toggle").addEventListener("click", () => (stream ? stopCamera() : startCamera()));
  const mt = $("#cam-mirror");
  mt.addEventListener("click", () => {
    mirror = !mirror;
    mt.classList.toggle("is-active", mirror);
    mt.textContent = mirror ? "Mirror: on" : "Mirror: off";
  });

  // "Find my vibe →" navigates to the Vibe view.
  $("#to-vibe").addEventListener("click", () => emit("navigate", "vibe"));

  // Release the camera when navigating away or hiding the page.
  on("navigate", (view) => { if (view !== "scan") stopCamera(); });
  window.addEventListener("pagehide", stopCamera);
}
