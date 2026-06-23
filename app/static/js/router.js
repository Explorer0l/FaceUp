// Minimal view router. Navigation goes through the bus ("navigate" events) so
// other modules (e.g. Mood scan releasing the camera) can react. applyView only
// touches the DOM and never re-emits, so there's no feedback loop.
import { emit, on } from "./bus.js";

function applyView(view) {
  document.querySelectorAll(".nav-item").forEach((n) =>
    n.classList.toggle("is-active", n.dataset.nav === view)
  );
  document.querySelectorAll(".view").forEach((v) =>
    v.classList.toggle("is-active", v.dataset.view === view)
  );
  document.querySelector(".content").scrollTop = 0;
}

export function initRouter() {
  document.querySelectorAll(".nav-item").forEach((item) =>
    item.addEventListener("click", () => emit("navigate", item.dataset.nav))
  );
  on("navigate", applyView);
}
