// Persistent player bar. In P1 it's a visual shell (play toggle + volume);
// P2 wires it to a real <audio> element playing Jamendo / uploaded tracks.
const $ = (s) => document.querySelector(s);

let playing = false;

export function initPlayer() {
  const btn = $("#player-play");
  btn.addEventListener("click", () => {
    playing = !playing;
    btn.textContent = playing ? "⏸" : "▶";
  });
  // Volume slider is wired here so it's ready for the real audio element in P2.
  $("#player-volume").addEventListener("input", (e) => {
    window._faceupVolume = Number(e.target.value) / 100;
  });
}
