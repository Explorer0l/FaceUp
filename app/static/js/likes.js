// Client-side Favorites store — the single source of truth for like-state.
// Holds the set of liked track ids, persists changes through the API, and
// broadcasts "likeschanged" so the player heart and Collection view stay in
// sync without importing each other. Toggles are optimistic and roll back on
// failure, so the UI feels instant but never lies about what's saved.
import { emit } from "./bus.js";
import { likedIds, likeTrack, unlikeTrack } from "./api.js";

const liked = new Set();

/** Fetch the liked ids once on startup so every view can render state offline. */
export async function loadLikes() {
  try {
    const ids = await likedIds();
    liked.clear();
    ids.forEach((id) => liked.add(id));
  } catch {
    liked.clear(); // a failed load just means "nothing known liked yet"
  }
  emit("likeschanged", { changed: null });
}

export function isLiked(trackId) {
  return liked.has(trackId);
}

/** Toggle a track's liked state. `track` must be a full Track (for liking). */
export async function toggleLike(track) {
  const id = track && track.id;
  if (!id) return;

  const wasLiked = liked.has(id);
  // Optimistic: update locally and notify, then persist.
  if (wasLiked) liked.delete(id);
  else liked.add(id);
  emit("likeschanged", { changed: id, liked: !wasLiked });

  try {
    if (wasLiked) await unlikeTrack(id);
    else await likeTrack(track);
  } catch (err) {
    // Roll back on failure so the store reflects what's actually saved.
    if (wasLiked) liked.add(id);
    else liked.delete(id);
    emit("likeschanged", { changed: id, liked: wasLiked, error: true });
    throw err;
  }
}
