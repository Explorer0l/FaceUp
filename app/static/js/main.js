// Entry point: wire every module and report server status.
import { getHealth } from "./api.js";
import { initRouter } from "./router.js";
import { initMoodScan } from "./moodScan.js";
import { initVibe } from "./vibe.js";
import { initFocus } from "./focus.js";
import { initPlayer } from "./player.js";
import { initAdd } from "./add.js";

async function checkHealth() {
  const el = document.querySelector("#server-status");
  try {
    const d = await getHealth();
    if (d.model_ready) {
      el.textContent = `ready · ${d.detector_webcam}`;
      el.className = "pill pill--ok";
    } else {
      el.textContent = "warming up…";
      el.className = "pill pill--warn";
      setTimeout(checkHealth, 1500);
    }
  } catch {
    el.textContent = "offline";
    el.className = "pill pill--err";
  }
}

initRouter();
initMoodScan();
initVibe();
initFocus();
initPlayer();
initAdd();
checkHealth();
