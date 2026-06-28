// Persistent player bar — real <audio> playback with a queue (P2).
// Other modules don't import this; they drive it through the bus ("playQueue").
import { on, emit } from "./bus.js";

const $ = (s) => document.querySelector(s);

const audio = new Audio();
let queue = [];
let index = -1;

function renderNowPlaying(t) {
  $("#player-title").textContent = t ? t.title : "Nothing playing";
  $("#player-artist").textContent = t ? t.artist : "Pick a vibe to start";
  const cover = $("#player-cover");
  if (t && t.cover_url) {
    cover.style.backgroundImage = `url("${t.cover_url}")`;
    cover.classList.add("has-cover");
    cover.textContent = "";
  } else {
    cover.style.backgroundImage = "";
    cover.classList.remove("has-cover");
    cover.textContent = "🎵";
  }
}

function setPlayIcon(isPlaying) {
  $("#player-play").textContent = isPlaying ? "⏸" : "▶";
}

async function load(i, autoplay = true) {
  if (i < 0 || i >= queue.length) return;
  index = i;
  const t = queue[index];
  audio.src = t.stream_url;
  renderNowPlaying(t);
  emit("nowplaying", { track: t, index });
  if (autoplay) {
    try {
      await audio.play(); // may reject if the browser blocks autoplay
    } catch {
      setPlayIcon(false); // leave it cued; the user can press play
    }
  }
}

function toggle() {
  if (!queue.length) return;
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
}

function next() {
  if (queue.length) load((index + 1) % queue.length);
}

function prev() {
  if (!queue.length) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; } // restart first
  load((index - 1 + queue.length) % queue.length);
}

export function initPlayer() {
  audio.volume = Number($("#player-volume").value) / 100 || 0.8;

  $("#player-play").addEventListener("click", toggle);
  $("#player-prev").addEventListener("click", prev);
  $("#player-next").addEventListener("click", next);

  audio.addEventListener("play", () => setPlayIcon(true));
  audio.addEventListener("pause", () => setPlayIcon(false));
  audio.addEventListener("ended", next);
  audio.addEventListener("timeupdate", () => {
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    $("#player-progress").style.width = `${pct}%`;
  });
  audio.addEventListener("error", () => {
    // A dead stream shouldn't freeze the queue — skip to the next track.
    if (queue.length > 1) next();
  });

  // Seek by clicking the progress bar.
  $("#player-bar").addEventListener("click", (e) => {
    if (!audio.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    audio.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * audio.duration;
  });

  $("#player-volume").addEventListener("input", (e) => {
    audio.volume = Number(e.target.value) / 100;
  });

  // The Vibe view hands us a queue + the track to start on.
  on("playQueue", ({ tracks, index: i }) => {
    queue = tracks || [];
    if (queue.length) load(i || 0, true);
  });
}
