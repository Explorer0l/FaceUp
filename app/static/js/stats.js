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

function bar(d, max) {
  const pct = max > 0 ? Math.round((d.minutes / max) * 100) : 0;
  return `
    <div class="bar7" title="${d.date}: ${d.minutes} min">
      <span class="bar7__val muted">${d.minutes || ""}</span>
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
  const max = Math.max(1, ...days.map((d) => d.minutes));
  box.className = "stats";
  box.innerHTML = `
    <div class="stat-tiles">
      <div class="stat-tile">
        <div class="stat-tile__num">${data.total_minutes}</div>
        <div class="stat-tile__label muted">Focus minutes</div>
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
