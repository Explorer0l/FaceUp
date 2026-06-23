// Tiny event bus so modules stay decoupled. Mood scan emits "emotion"; the
// Vibe view and player listen, without importing each other.
const target = new EventTarget();

export function emit(type, detail) {
  target.dispatchEvent(new CustomEvent(type, { detail }));
}

export function on(type, handler) {
  target.addEventListener(type, (e) => handler(e.detail));
}
