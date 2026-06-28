// Stats panel (P6) — renders focus-session stats into #stats-panel on the
// Focus & Stats page: total minutes, session count, and a per-day bar chart.
// Refreshes when the view is opened and whenever a session is logged
// ("statschanged", emitted by focus.js on timer completion).
import { on } from "./bus.js";
import { getFocusStats } from "./api.js";

const $ = (s) => document.querySelector(s);

function isActive() {
  return $('[data-view="focus"]').classList.contains("is-active");
}

// "2026-06-28" -> "Sun" (weekday label for a bar).
function dayLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

// Seconds -> human duration, keeping enough precision that accumulation is
// always visible: 30 -> "30s", 70 -> "1m 10s", 1500 -> "25m", 5430 -> "1h 30m".
// Seconds are shown below the hour mark (where they matter) and dropped above it.
function fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s && !h) parts.push(`${s}s`);
  return parts.length ? parts.join(" ") : "0s";
}

// Short per-bar label: minutes for >= 1 min, otherwise seconds.
function barLabel(sec) {
  if (!sec) return "";
  return sec >= 60 ? `${Math.round(sec / 60)}m` : `${sec}s`;
}

function bar(d, max) {
  const pct = max > 0 ? Math.round((d.seconds / max) * 100) : 0;
  return `
    <div class="bar7" title="${d.date}: ${fmtDuration(d.seconds)}">
      <span class="bar7__val muted">${barLabel(d.seconds)}</span>
      <span class="bar7__track"><span class="bar7__fill" style="height:${pct}%"></span></span>
      <span class="bar7__day muted">${dayLabel(d.date)}</span>
    </div>`;
}

function render(data) {
  const box = $("#stats-panel");
  if (!data || !data.total_sessions) {
    box.className = "placeholder";
    box.textContent =
      "📊 No focus sessions yet — finish a timer above and your progress shows up here.";
    return;
  }
  const days = data.days || [];
  const max = Math.max(1, ...days.map((d) => d.seconds));
  box.className = "stats";
  box.innerHTML = `
    <div class="stat-tiles">
      <div class="stat-tile">
        <div class="stat-tile__num">${fmtDuration(data.total_seconds)}</div>
        <div class="stat-tile__label muted">Focus time</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__num">${data.total_sessions}</div>
        <div class="stat-tile__label muted">Sessions</div>
      </div>
    </div>
    <div class="stat-chart">
      <div class="stat-chart__head muted">Last 7 days</div>
      <div class="bars7">${days.map((d) => bar(d, max)).join("")}</div>
    </div>`;
}

async function refresh() {
  try {
    render(await getFocusStats());
  } catch {
    const box = $("#stats-panel");
    box.className = "placeholder";
    box.textContent = "Couldn't load your stats.";
  }
}

export function initStats() {
  on("navigate", (view) => { if (view === "focus") refresh(); });
  on("statschanged", () => { if (isActive()) refresh(); });
}
