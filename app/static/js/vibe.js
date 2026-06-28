// Vibe view: the hero tints to the current emotion and drives recommendations.
// Mood tiles + Match/Lift toggle call /api/recommend (Audius, local fallback);
// clicking a track hands the whole list to the player as a queue.
import { EMOTIONS } from "./emotions.js";
import { emit, on } from "./bus.js";
import { getRecommendations } from "./api.js";

const $ = (s) => document.querySelector(s);

let mood = "happy";
let mode = "lift"; // "match" | "lift"
let tracks = [];
let reqToken = 0; // guards against out-of-order responses

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function subText() {
  return `Mood: ${mood} · ${mode === "lift" ? "lifting it higher" : "matching it"}`;
}

function trackCard(t, i) {
  const ph = (EMOTIONS[mood] || EMOTIONS.neutral).emoji;
  const cover = t.cover_url
    ? `<div class="rc__cover" style="background-image:url('${escapeHtml(t.cover_url)}')"></div>`
    : `<div class="rc__cover rc__cover--ph">${ph}</div>`;
  return `
    <button class="rc" data-i="${i}" title="${escapeHtml(t.title)} — ${escapeHtml(t.artist)}">
      ${cover}
      <span class="rc__play">▶</span>
      <div class="rc__title">${escapeHtml(t.title)}</div>
      <div class="rc__artist muted">${escapeHtml(t.artist)}</div>
    </button>`;
}

async function loadRecos() {
  const list = $("#reco-list");
  const token = ++reqToken;
  list.className = "reco";
  list.innerHTML = `<p class="muted">Loading ${mood} tracks…</p>`;
  try {
    const data = await getRecommendations(mood, mode, 18);
    if (token !== reqToken) return; // a newer request superseded this one
    tracks = data.tracks || [];
    if (!tracks.length) {
      list.innerHTML = `<p class="muted">No tracks found for this mood. Try another.</p>`;
      return;
    }
    const note =
      data.source === "local"
        ? `<span class="tag">offline library</span>`
        : `<span class="tag">${escapeHtml((data.moods || []).join(" · "))}</span>`;
    list.className = "reco";
    list.innerHTML =
      `<div class="reco__head muted">${tracks.length} tracks ${note}</div>` +
      `<div class="reco-grid">${tracks.map(trackCard).join("")}</div>`;
    list.querySelectorAll(".rc").forEach((el) =>
      el.addEventListener("click", () =>
        emit("playQueue", { tracks, index: Number(el.dataset.i) })
      )
    );
  } catch (e) {
    if (token !== reqToken) return;
    list.className = "reco";
    list.innerHTML = `<p class="error">Couldn't load music: ${escapeHtml(e.message)}</p>`;
  }
}

function setVibe(next, { reload = true } = {}) {
  if (next && EMOTIONS[next]) mood = next;
  $("#vibe-grad").style.background = (EMOTIONS[mood] || EMOTIONS.neutral).grad;
  $("#vibe-sub").textContent = subText();
  document.querySelectorAll(".tile").forEach((t) =>
    t.classList.toggle("is-active", t.dataset.mood === mood)
  );
  if (reload) loadRecos();
}

export function initVibe() {
  document.querySelectorAll(".tile").forEach((tile) =>
    tile.addEventListener("click", () => setVibe(tile.dataset.mood))
  );
  document.querySelectorAll(".seg__opt").forEach((opt) =>
    opt.addEventListener("click", () => {
      document.querySelectorAll(".seg__opt").forEach((o) => o.classList.remove("is-active"));
      opt.classList.add("is-active");
      mode = opt.dataset.mode;
      setVibe();
    })
  );
  $("#vibe-scan").addEventListener("click", () => emit("navigate", "scan"));

  // A detected emotion (from Mood scan) tints the vibe and reloads music.
  on("emotion", ({ emotion }) => setVibe(emotion));

  // Landing on the Vibe view with nothing loaded yet → fetch the current mood.
  on("navigate", (view) => {
    if (view === "vibe" && !tracks.length) loadRecos();
  });

  // A new/removed upload can change recommendations — refresh if we're showing some.
  on("uploadschanged", () => {
    if (tracks.length) loadRecos();
  });

  // Highlight the track the player is currently on.
  on("nowplaying", ({ index }) => {
    document.querySelectorAll(".rc").forEach((el) =>
      el.classList.toggle("is-playing", Number(el.dataset.i) === index)
    );
  });

  // Set the hero up front, but don't fetch until the user lands here / picks a mood.
  setVibe("happy", { reload: false });
}
