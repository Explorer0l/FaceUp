// Collection view — the user's Favorites. Lists liked tracks (snapshots saved
// server-side) as playable cards; the whole list becomes the player queue, and
// each card can be unliked in place. Stays in sync with the rest of the app via
// the shared likes store ("likeschanged").
//
// Sync model: fetch the authoritative list when the user enters the view, then
// reconcile *locally* against the store on "likeschanged" (removing cards that
// were unliked anywhere). Reconciling from the store rather than re-fetching
// keeps unlike instant and avoids racing the in-flight DELETE.
import { emit, on } from "./bus.js";
import { listLikes } from "./api.js";
import { isLiked, toggleLike } from "./likes.js";

const $ = (s) => document.querySelector(s);

let tracks = [];
let playingId = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function isActive() {
  return $('[data-view="collection"]').classList.contains("is-active");
}

function card(t, i) {
  const cover = t.cover_url
    ? `<div class="rc__cover" style="background-image:url('${escapeHtml(t.cover_url)}')"></div>`
    : `<div class="rc__cover rc__cover--ph">🎵</div>`;
  const playing = t.id === playingId ? " is-playing" : "";
  return `
    <div class="rc${playing}" data-i="${i}" data-id="${escapeHtml(t.id)}"
         title="${escapeHtml(t.title)} — ${escapeHtml(t.artist)}">
      ${cover}
      <button class="rc__like" title="Remove from favorites" aria-label="Remove from favorites">❤️</button>
      <span class="rc__play">▶</span>
      <div class="rc__title">${escapeHtml(t.title)}</div>
      <div class="rc__artist muted">${escapeHtml(t.artist)}</div>
    </div>`;
}

function render() {
  const box = $("#like-list");
  if (!tracks.length) {
    box.className = "placeholder";
    box.textContent = "❤️ No favorites yet — tap the heart on any track to save it here.";
    return;
  }
  box.className = "reco-grid";
  box.innerHTML = tracks.map(card).join("");
  box.querySelectorAll(".rc").forEach((el, i) => {
    el.addEventListener("click", () => emit("playQueue", { tracks, index: i }));
    el.querySelector(".rc__like").addEventListener("click", (e) => {
      e.stopPropagation(); // don't start playback when removing
      toggleLike(tracks[i]).catch(() => {}); // card removal comes via reconcile()
    });
  });
}

async function refresh() {
  const box = $("#like-list");
  try {
    tracks = await listLikes();
  } catch {
    box.className = "placeholder";
    box.textContent = "Couldn't load your favorites.";
    return;
  }
  render();
}

// Drop cards that are no longer liked (unliked here or from the player heart).
function reconcile() {
  const next = tracks.filter((t) => isLiked(t.id));
  if (next.length !== tracks.length) {
    tracks = next;
    render();
  }
}

export function initCollection() {
  on("navigate", (view) => { if (view === "collection") refresh(); });
  on("likeschanged", () => { if (isActive()) reconcile(); });

  // Track + reflect whichever favorite is currently playing.
  on("nowplaying", ({ track }) => {
    playingId = track ? track.id : null;
    document.querySelectorAll("#like-list .rc").forEach((el) =>
      el.classList.toggle("is-playing", el.dataset.id === playingId)
    );
  });
}
