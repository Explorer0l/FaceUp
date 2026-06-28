// Add-songs view (P3): upload audio tagged by mood, list/play/delete your tracks.
// Uploaded tracks join recommendations server-side; here they're also directly
// playable through the shared player (via the "playQueue" bus event).
import { EMOTIONS } from "./emotions.js";
import { emit } from "./bus.js";
import { listUploads, uploadTrack, deleteUpload } from "./api.js";

const $ = (s) => document.querySelector(s);

let mood = "happy";
let file = null;
let cover = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// Public URL for a row's custom cover image, or "" if it has none. Mirrors how
// stream_url is built from the stored filename.
function coverUrl(row) {
  return row.cover_filename ? `/uploads/covers/${row.cover_filename}` : "";
}

// An UploadedTrack row -> the player's track shape.
function toPlayable(row) {
  return {
    id: `upload:${row.id}`,
    title: row.title,
    artist: row.artist,
    mood: row.emotion,
    stream_url: `/uploads/${row.filename}`,
    cover_url: coverUrl(row),
    source: "local",
  };
}

// Leading thumbnail for a track row: the custom cover if present, else the
// emotion emoji.
function thumb(row) {
  const url = coverUrl(row);
  if (url) {
    return `<span class="ut__thumb" style="background-image:url('${escapeHtml(url)}')"></span>`;
  }
  const e = EMOTIONS[row.emotion] || EMOTIONS.neutral;
  return `<span class="ut__emoji" title="${escapeHtml(row.emotion)}">${e.emoji}</span>`;
}

function showMsg(text, isError = false) {
  const el = $("#upload-msg");
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle("error", isError);
  el.classList.toggle("muted", !isError);
}

async function refreshList() {
  const box = $("#upload-list");
  let rows;
  try {
    rows = await listUploads();
  } catch {
    box.innerHTML = `<p class="error">Couldn't load your uploads.</p>`;
    return;
  }
  if (!rows.length) {
    box.innerHTML = `<p class="muted">No uploads yet. Add one on the left.</p>`;
    return;
  }
  box.innerHTML = rows
    .map((r) => {
      return `
      <div class="ut" data-id="${r.id}">
        ${thumb(r)}
        <div class="ut__meta">
          <div class="ut__title">${escapeHtml(r.title)}</div>
          <div class="ut__artist muted">${escapeHtml(r.artist)}</div>
        </div>
        <button class="iconbtn ut__play" title="Play">▶</button>
        <button class="iconbtn ut__del" title="Delete">🗑</button>
      </div>`;
    })
    .join("");

  // Play any upload — the whole list becomes the queue, starting at the click.
  const playable = rows.map(toPlayable);
  box.querySelectorAll(".ut").forEach((el, i) => {
    el.querySelector(".ut__play").addEventListener("click", () =>
      emit("playQueue", { tracks: playable, index: i })
    );
    el.querySelector(".ut__del").addEventListener("click", async () => {
      el.querySelector(".ut__del").disabled = true;
      // Release the browser's hold on this file (it may be the active <audio>
      // source) before the server tries to unlink it.
      emit("releaseTrack", { stream_url: playable[i].stream_url });
      try {
        await deleteUpload(Number(el.dataset.id));
        await refreshList();
        emit("uploadschanged");
      } catch {
        showMsg("Couldn't delete that track.", true);
      }
    });
  });
}

function pickFile(f) {
  if (!f) return;
  if (!f.type.startsWith("audio/") && !/\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(f.name)) {
    showMsg("Please choose an audio file.", true);
    return;
  }
  file = f;
  $("#upload-filename").innerHTML = `${escapeHtml(f.name)}<br /><small class="muted">${(f.size / 1048576).toFixed(1)} MB</small>`;
  if (!$("#upload-title").value) $("#upload-title").value = f.name.replace(/\.[^.]+$/, "");
}

const COVER_PLACEHOLDER = `<span class="cover-pick__icon">🖼️</span><span class="muted">Add cover<br /><small>jpg, png, webp · optional</small></span>`;

function renderCoverPreview() {
  const box = $("#cover-preview");
  if (cover) {
    box.classList.add("has-cover");
    box.style.backgroundImage = `url('${URL.createObjectURL(cover)}')`;
    box.innerHTML = "";
  } else {
    box.classList.remove("has-cover");
    box.style.backgroundImage = "";
    box.innerHTML = COVER_PLACEHOLDER;
  }
}

function pickCover(f) {
  if (!f) return;
  if (!f.type.startsWith("image/") && !/\.(jpe?g|png|webp|gif)$/i.test(f.name)) {
    showMsg("Please choose an image file for the cover.", true);
    return;
  }
  cover = f;
  renderCoverPreview();
}

async function submit(e) {
  e.preventDefault();
  if (!file) {
    showMsg("Choose an audio file first.", true);
    return;
  }
  const form = new FormData();
  form.append("file", file);
  form.append("title", $("#upload-title").value);
  form.append("artist", $("#upload-artist").value);
  form.append("emotion", mood);
  if (cover) form.append("cover", cover);

  const btn = $("#upload-submit");
  btn.disabled = true;
  btn.textContent = "Uploading…";
  try {
    const row = await uploadTrack(form);
    showMsg(`Added “${row.title}” as ${row.emotion}.`);
    // reset the form
    file = null;
    cover = null;
    $("#upload-form").reset();
    renderCoverPreview();
    $("#upload-filename").innerHTML =
      `Click to choose an audio file<br /><small class="muted">mp3, wav, ogg, m4a, flac · max 20&nbsp;MB</small>`;
    await refreshList();
    emit("uploadschanged");
  } catch (err) {
    showMsg(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Upload track";
  }
}

export function initAdd() {
  const input = $("#upload-file");
  input.addEventListener("change", (e) => pickFile(e.target.files[0]));

  const drop = $("#upload-drop");
  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-drag"); })
  );
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-drag"); })
  );
  drop.addEventListener("drop", (e) => pickFile(e.dataTransfer?.files?.[0]));

  // Optional custom cover image (click to choose or drag-drop onto the preview).
  const coverInput = $("#cover-file");
  coverInput.addEventListener("change", (e) => pickCover(e.target.files[0]));
  const coverBox = $("#cover-preview");
  ["dragenter", "dragover"].forEach((ev) =>
    coverBox.addEventListener(ev, (e) => { e.preventDefault(); coverBox.classList.add("is-drag"); })
  );
  ["dragleave", "drop"].forEach((ev) =>
    coverBox.addEventListener(ev, (e) => { e.preventDefault(); coverBox.classList.remove("is-drag"); })
  );
  coverBox.addEventListener("drop", (e) => pickCover(e.dataTransfer?.files?.[0]));

  $("#upload-mood").querySelectorAll(".moodbtn").forEach((b) =>
    b.addEventListener("click", () => {
      $("#upload-mood").querySelectorAll(".moodbtn").forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");
      mood = b.dataset.mood;
    })
  );

  $("#upload-form").addEventListener("submit", submit);
  refreshList();
}
