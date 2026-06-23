// Vibe view: the hero tints to the current emotion and drives recommendations.
// In P1 the recommendation cards are samples; P2 wires real Jamendo + uploads.
import { EMOTIONS, EMOTION_ORDER } from "./emotions.js";
import { emit, on } from "./bus.js";

const $ = (s) => document.querySelector(s);

let mood = "happy";
let mode = "lift"; // "match" | "lift"

// Placeholder track names per mood so the layout feels real before P2.
const SAMPLES = {
  happy: ["Bright Days", "Golden Hour", "Skip Along", "Good News"],
  sad: ["Quiet Light", "Paper Boats", "Slow Rain", "Still Here"],
  angry: ["Cooling Down", "Steady Breath", "Let It Pass", "Low Tide"],
  surprised: ["Out of Nowhere", "Plot Twist", "Confetti", "Spark"],
  neutral: ["Drift", "Open Window", "Plain Sky", "Easy Does It"],
};

function subText() {
  return `Mood: ${mood} · ${mode === "lift" ? "lifting it higher" : "matching it"}`;
}

function renderRecos() {
  const list = $("#reco-list");
  const titles = SAMPLES[mood] || SAMPLES.neutral;
  const color = (EMOTIONS[mood] || EMOTIONS.neutral).color;
  list.className = "reco reco-grid";
  list.innerHTML = titles
    .map(
      (t) => `
      <div class="card" style="padding:12px">
        <div style="height:90px;border-radius:10px;background:${color}22;display:flex;align-items:center;justify-content:center;font-size:1.8rem">${(EMOTIONS[mood] || EMOTIONS.neutral).emoji}</div>
        <div style="margin-top:8px;font-size:0.9rem;font-weight:500">${t}</div>
        <div class="muted" style="font-size:0.8rem">Sample station <span class="tag">P2</span></div>
      </div>`
    )
    .join("");
}

function setVibe(next) {
  if (next && EMOTIONS[next]) mood = next;
  $("#vibe-grad").style.background = (EMOTIONS[mood] || EMOTIONS.neutral).grad;
  $("#vibe-sub").textContent = subText();
  document.querySelectorAll(".tile").forEach((t) =>
    t.classList.toggle("is-active", t.dataset.mood === mood)
  );
  renderRecos();
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

  // A detected emotion (from Mood scan) tints the vibe automatically.
  on("emotion", ({ emotion }) => setVibe(emotion));

  setVibe("happy");
}
