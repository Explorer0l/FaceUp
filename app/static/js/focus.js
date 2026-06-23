// Focus view: a working Pomodoro countdown. P5 adds the focus music station
// and P6 logs completed sessions to the SQLite stats backend.
const $ = (s) => document.querySelector(s);

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

function tick() {
  remaining = Math.max(0, remaining - 1);
  render();
  if (remaining === 0) {
    stop();
    $("#focus-time").textContent = "Done!";
  }
}

function start() {
  if (timer) return;
  if (remaining === 0) remaining = totalSec;
  timer = setInterval(tick, 1000);
  $("#focus-toggle").textContent = "Pause";
  $("#focus-toggle").classList.add("is-on");
}

export function initFocus() {
  render();
  $("#focus-toggle").addEventListener("click", () => (timer ? stop() : start()));
  $("#focus-reset").addEventListener("click", () => { stop(); remaining = totalSec; render(); });
  document.querySelectorAll(".preset").forEach((p) =>
    p.addEventListener("click", () => {
      document.querySelectorAll(".preset").forEach((x) => x.classList.remove("is-active"));
      p.classList.add("is-active");
      stop();
      totalSec = Number(p.dataset.min) * 60;
      remaining = totalSec;
      render();
    })
  );
}
