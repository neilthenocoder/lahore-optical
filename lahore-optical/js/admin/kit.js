// Admin helpers: toasts, confirm dialogs, uploads with progress, client-side
// image compression, drag-to-reorder lists, CSV, downloads.
import { CONFIG } from "../config.js";
import { esc } from "../lib/util.js";

export { esc };
export const state = { sb: null, session: null };

/* ------------------------------ toasts ------------------------------ */
export function toast(msg, type = "ok") {
  const wrap = document.getElementById("toasts");
  const t = document.createElement("div");
  t.className = "toast" + (type === "error" ? " toast--error" : "");
  t.textContent = msg;
  wrap.append(t);
  setTimeout(() => t.remove(), type === "error" ? 7000 : 3000);
}
export const fail = (e, what = "Something went wrong") => { console.error(e); toast(`${what}: ${e?.message || e}`, "error"); };

/* ------------------------------ confirm ------------------------------ */
export function confirmDialog(message, okLabel = "Delete") {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "confirm";
    d.innerHTML = `<p class="h3">${esc(message)}</p><p class="hint">This cannot be undone.</p>
      <div class="actions"><button class="btn btn--outline btn-sm" type="button" value="no">Cancel</button>
      <button class="btn btn--solid btn-sm" type="button" value="yes">${esc(okLabel)}</button></div>`;
    document.body.append(d);
    const opener = document.activeElement;
    d.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) d.close(b.value); });
    d.addEventListener("close", () => { resolve(d.returnValue === "yes"); d.remove(); opener?.focus?.(); });
    d.showModal();
    d.querySelector('[value="no"]').focus();
  });
}

/* ------------------------------ uploads ------------------------------ */
const IMG_TYPES = ["image/webp", "image/jpeg", "image/png"];

export function validateImage(file, { pngOnly = false, allowVideo = false } = {}) {
  if (pngOnly && file.type !== "image/png") return "Try-on images must be a transparent PNG.";
  if (allowVideo && /^video\/(mp4|webm)$/.test(file.type)) return null;
  if (!IMG_TYPES.includes(file.type)) return "Use a WebP, JPG or PNG image.";
  return null;
}

/** Resizes to max 2000px and re-encodes (WebP, or PNG to keep transparency). */
export async function compressImage(file, { max = 2000, keepPng = false } = {}) {
  if (!file.type.startsWith("image/")) return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (k === 1 && file.type === "image/webp" && file.size < 600_000) return file;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const type = keepPng ? "image/png" : "image/webp";
  let blob = await new Promise((r) => c.toBlob(r, type, 0.85));
  if (!blob || (!keepPng && blob.type !== "image/webp")) blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.86));
  return blob || file;
}

export const extFor = (type) => ({ "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "video/mp4": "mp4", "video/webm": "webm" })[type] || "bin";
export const publicUrl = (bucket, path) => `${CONFIG.supabaseUrl}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
export const pathFromPublicUrl = (bucket, url) => {
  const m = String(url || "").split(`/storage/v1/object/public/${bucket}/`)[1];
  return m ? decodeURIComponent(m) : null;
};

function tray() {
  let t = document.querySelector(".progress-tray");
  if (!t) { t = document.createElement("div"); t.className = "progress-tray"; t.setAttribute("aria-live", "polite"); document.body.append(t); }
  return t;
}

/** Upload via XHR so we can show real progress. Returns the public URL. */
export async function upload(bucket, path, blob, label = "Uploading") {
  const { data } = await state.sb.auth.getSession();
  const token = data.session?.access_token;
  const item = document.createElement("div");
  item.className = "progress-item";
  item.innerHTML = `<span>${esc(label)}</span><progress max="100" value="0"></progress>`;
  tray().append(item);
  const bar = item.querySelector("progress");
  try {
    await new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open("POST", `${CONFIG.supabaseUrl}/storage/v1/object/${bucket}/${path}`);
      x.setRequestHeader("Authorization", `Bearer ${token}`);
      x.setRequestHeader("apikey", CONFIG.supabaseAnonKey);
      x.setRequestHeader("x-upsert", "true");
      x.setRequestHeader("cache-control", "max-age=31536000");
      x.setRequestHeader("Content-Type", blob.type || "application/octet-stream");
      x.upload.onprogress = (e) => { if (e.lengthComputable) bar.value = Math.round((e.loaded / e.total) * 100); };
      x.onload = () => (x.status < 300 ? resolve() : reject(new Error(parseErr(x.responseText) || `Upload failed (${x.status})`)));
      x.onerror = () => reject(new Error("Network error during upload"));
      x.send(blob);
    });
    bar.value = 100;
    return publicUrl(bucket, path);
  } finally { setTimeout(() => item.remove(), 800); }
}
function parseErr(t) { try { const j = JSON.parse(t); return j.message || j.error; } catch { return t; } }

/** Validate → compress → upload. Returns public URL or null on validation error. */
export async function uploadImage(bucket, folder, file, opts = {}) {
  const bad = validateImage(file, opts);
  if (bad) { toast(bad, "error"); return null; }
  const isVideo = file.type.startsWith("video/");
  const blob = isVideo ? file : await compressImage(file, { keepPng: opts.pngOnly || (opts.keepPng && file.type === "image/png") });
  const path = `${folder}/${crypto.randomUUID()}.${extFor(blob.type || file.type)}`;
  return upload(bucket, path, blob, `Uploading ${file.name}`);
}

/* ------------------------------ sortable ------------------------------ */
/**
 * Drag to reorder <li> children of `list`; ↑/↓ buttons give a keyboard path.
 * onChange(orderedIds) is called after each move.
 */
export function sortable(list, onChange) {
  let dragEl = null;
  const ids = () => [...list.children].map((li) => li.dataset.id);
  // only the handle starts a drag, so text inputs inside rows stay usable
  list.addEventListener("pointerdown", (e) => {
    const li = e.target.closest("li[data-id]");
    if (li) li.draggable = !!e.target.closest(".handle");
  });
  list.addEventListener("dragstart", (e) => {
    const li = e.target.closest("li[data-id]"); if (!li) return;
    dragEl = li; li.classList.add("dragging"); e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", li.dataset.id);
  });
  list.addEventListener("dragover", (e) => {
    if (!dragEl) return; e.preventDefault();
    const over = e.target.closest("li[data-id]"); if (!over || over === dragEl) return;
    const r = over.getBoundingClientRect();
    const after = (e.clientY - r.top) > r.height / 2;
    list.insertBefore(dragEl, after ? over.nextSibling : over);
  });
  list.addEventListener("dragend", () => { if (!dragEl) return; dragEl.classList.remove("dragging"); dragEl = null; onChange(ids()); });
  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-move]"); if (!b) return;
    const li = b.closest("li");
    if (b.dataset.move === "up" && li.previousElementSibling) li.previousElementSibling.before(li);
    else if (b.dataset.move === "down" && li.nextElementSibling) li.nextElementSibling.after(li);
    else return;
    b.focus();
    onChange(ids());
  });
}
export const handleHTML = (label) => `<span class="handle" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
  <span class="mv"><button type="button" data-move="up" aria-label="Move ${esc(label)} up">▲</button><button type="button" data-move="down" aria-label="Move ${esc(label)} down">▼</button></span>`;

/** Persist sort_order for a table from an ordered id list. */
export async function saveOrder(table, ids) {
  const sb = state.sb;
  const results = await Promise.all(ids.map((id, i) => sb.from(table).update({ sort_order: i + 1 }).eq("id", id)));
  const err = results.find((r) => r.error)?.error;
  if (err) throw err;
}

/* ------------------------------ CSV ------------------------------ */
export function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter((r) => r.some((c) => c.trim() !== ""));
  const head = (clean.shift() || []).map((h) => h.trim().toLowerCase());
  return clean.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}
export const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function download(name, text, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

export const fmtDate = (d) => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
export const toLocalInput = (d) => { if (!d) return ""; const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
