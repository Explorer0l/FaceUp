// Focus view: a working countdown timer with second precision — presets
// (30 sec / 5 / 25 / 50 min) plus a custom minutes:seconds duration. Completed
// sessions are logged (in seconds) to the SQLite stats backend (P6); P5 will add
// the focus music station.
import { emit } from "./bus.js";
import { logFocusSession } from "./api.js";

const $ = (s) => document.querySelector(s);

const MAX_SECONDS = 24 * 60 * 60; // sanity cap (matches the API limit)

let totalSec = 25 * 60;
let remaining = totalSec;
let timer = null;

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function render() {
  $("#focus-time").textContent = fmt(remaining);
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
  $("#focus-toggle").textContent = "Start focus";
  $("#focus-toggle").classList.remove("is-on");
}

// Switch to a new duration (seconds), stopping any running countdown.
function setDuration(seconds) {
  stop();
  totalSec = Math.min(MAX_SECONDS, Math.max(1, Math.round(seconds)));
  remaining = totalSec;
  render();
}

function tick() {
  remaining = Math.max(0, remaining - 1);
  render();
  if (remaining === 0) {
    stop();
    $("#focus-time").textContent = "Done!";
    // Log the completed session length (in seconds); refresh the stats panel.
    logFocusSession(totalSec).then(() => emit("statschanged")).catch(() => {});
  }
}

function start() {
  if (timer) return;
  if (remaining === 0) remaining = totalSec;
  timer = setInterval(tick, 1000);
  $("#focus-toggle").textContent = "Pause";
  $("#focus-toggle").classList.add("is-on");
}

function clearPresetSelection() {
  document.querySelectorAll(".preset").forEach((x) => x.classList.remove("is-active"));
}

function applyCustom(e) {
  e.preventDefault();
  const min = Number($("#focus-min").value) || 0;
  const sec = Number($("#focus-sec").value) || 0;
  const seconds = min * 60 + sec;
  if (seconds <= 0) return; // ignore empty/zero input
  clearPresetSelection();
  setDuration(seconds);
}

export function initFocus() {
  render();
  $("#focus-toggle").addEventListener("click", () => (timer ? stop() : start()));
  $("#focus-reset").addEventListener("click", () => { stop(); remaining = totalSec; render(); });

  document.querySelectorAll(".preset").forEach((p) =>
    p.addEventListener("click", () => {
      clearPresetSelection();
      p.classList.add("is-active");
      setDuration(Number(p.dataset.sec));
    })
  );

  $("#focus-custom").addEventListener("submit", applyCustom);
}
