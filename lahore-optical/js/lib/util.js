import { CONFIG } from "../config.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
/** Always "₹4,500" */
export const formatPrice = (n) => (n == null || n === "" ? "" : "₹" + inr.format(Math.round(Number(n))));

export const waLink = (text) =>
  `https://wa.me/${CONFIG.whatsappNumber}${text ? "?text=" + encodeURIComponent(text) : ""}`;

export const WA_TEXT = {
  general: "Hi Lahore Optical, I'd like to order eyewear.",
  eyetest: "Hi Lahore Optical, I'd like to book an eye test. Preferred day and time: ",
  hello: "Hi Lahore Optical, I have a question.",
};

export const MAPS_FALLBACK =
  "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent("Lahore Optical, 34/9 Church Building, Hazratganj, Lucknow 226001");

export const mqSmall = window.matchMedia("(max-width: 809px)");
export const mqReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
export const isSmall = () => mqSmall.matches;
export const reducedMotion = () => mqReduced.matches;

export const slugify = (s) =>
  String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export function siteOrigin() {
  return (CONFIG.siteUrl || location.origin).replace(/\/$/, "");
}

const ICONS = {
  whatsapp: '<path d="M3.5 20.5l1.3-4.3A8.5 8.5 0 1 1 7.9 19.3z"/><path d="M9.2 8.2c-.2 3.6 3 6.8 6.6 6.6l.9-1.5-2-1-.9.8a4.6 4.6 0 0 1-2.8-2.8l.8-.9-1-2z"/>',
  phone: '<path d="M5 3.5h3.4l1.6 4-2 1.6a11 11 0 0 0 6.9 6.9l1.6-2 4 1.6V19a1.5 1.5 0 0 1-1.5 1.5A16.5 16.5 0 0 1 3.5 5 1.5 1.5 0 0 1 5 3.5z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  arrowRight: '<path d="M4 12h16M14 6l6 6-6 6"/>',
  arrowLeft: '<path d="M20 12H4M10 6l-6 6 6 6"/>',
  menu: '<path d="M3 7h18M3 12h18M3 17h18"/>',
  close: '<path d="M5 5l14 14M19 5L5 19"/>',
  camera: '<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
};
export const icon = (n, cls = "icon") =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[n] || ""}</svg>`;

/**
 * Image slot. Without a URL it is the #333 placeholder with a centred label;
 * with a URL it renders a real <img> that fills the same reserved box (CLS ≈ 0).
 */
export function slotHTML({ key = "", label = "", ar = "1 / 1", url = "", alt = "", priority = false, cls = "", w = 1200, h = 1200 } = {}) {
  const k = key ? ` data-slot="${esc(key)}"` : "";
  const inner = url
    ? imgHTML(url, alt, priority, w, h)
    : `<span class="slot__label">${esc(label)}</span>`;
  return `<div class="slot ${cls}" style="--ar:${ar}"${k}>${inner}</div>`;
}

export function imgHTML(url, alt, priority, w = 1200, h = 1200) {
  const load = priority ? 'fetchpriority="high"' : 'loading="lazy"';
  return `<img src="${esc(url)}" alt="${esc(alt)}" width="${w}" height="${h}" decoding="async" ${load}>`;
}

/** Drops a real image / video into an existing placeholder slot element. */
export function fillSlot(el, url, alt) {
  if (!el || !url) return;
  const isVideo = /\.(mp4|webm)(\?|$)/i.test(url);
  const priority = el.dataset.priority === "high";
  const label = el.querySelector(".slot__label");
  if (isVideo) {
    const v = document.createElement("video");
    v.src = url; v.muted = true; v.loop = true; v.playsInline = true;
    v.setAttribute("playsinline", ""); v.setAttribute("aria-label", alt || el.dataset.alt || "");
    if (!reducedMotion()) { v.autoplay = true; v.setAttribute("autoplay", ""); } else v.controls = true;
    v.preload = "metadata";
    el.replaceChildren(v);
  } else {
    const img = new Image();
    img.decoding = "async";
    if (priority) img.fetchPriority = "high"; else img.loading = "lazy";
    img.width = 1600; img.height = Math.round(1600 / ratioOf(el));
    img.alt = alt ?? el.dataset.alt ?? "";
    img.src = url;
    if (label) label.remove();
    el.replaceChildren(img);
  }
}
function ratioOf(el) {
  const ar = getComputedStyle(el).aspectRatio; // "4 / 5"
  const [a, b] = String(ar).split("/").map(Number);
  return a && b ? a / b : 1;
}

/** Simple toast */
export function toast(msg, ms = 3200) {
  let wrap = document.querySelector(".toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    wrap.setAttribute("role", "status");
    wrap.setAttribute("aria-live", "polite");
    document.body.append(wrap);
  }
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  wrap.append(t);
  setTimeout(() => t.remove(), ms);
}

/** Opens a <dialog> modally and returns focus to the opener on close. */
export function openDialog(dlg) {
  const opener = document.activeElement;
  dlg.showModal();
  document.body.classList.add("is-locked");
  const onClose = () => {
    document.body.classList.remove("is-locked");
    dlg.removeEventListener("close", onClose);
    if (opener && typeof opener.focus === "function") opener.focus();
  };
  dlg.addEventListener("close", onClose);
  if (!dlg._backdropBound) {
    dlg._backdropBound = true;
    // A click on the backdrop (the dialog element itself) closes it
    dlg.addEventListener("click", (e) => { if (e.target === dlg && !dlg.dataset.noBackdropClose) dlg.close(); });
  }
}

/** Short human reference: LO-XXXXX (no ambiguous chars). */
export function makeRef() {
  const A = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const b = crypto.getRandomValues(new Uint8Array(5));
  return "LO-" + [...b].map((x) => A[x % A.length]).join("");
}

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

/** Back link: history.back() when we came from this site, else go home. */
export function initBackLinks(root = document) {
  root.querySelectorAll("[data-back]").forEach((a) => {
    a.addEventListener("click", (e) => {
      let same = false;
      try { same = document.referrer && new URL(document.referrer).origin === location.origin; } catch {}
      if (same && history.length > 1) { e.preventDefault(); history.back(); }
    });
  });
}

export function setMeta({ title, description, canonical, image, noindex }) {
  if (title) { document.title = title; setProp("og:title", title); }
  if (description) {
    let m = document.querySelector('meta[name="description"]');
    m.setAttribute("content", description); setProp("og:description", description);
  }
  if (canonical) {
    const abs = canonical.startsWith("http") ? canonical : siteOrigin() + canonical;
    let l = document.querySelector('link[rel="canonical"]');
    if (!l) { l = document.createElement("link"); l.rel = "canonical"; document.head.append(l); }
    l.href = abs; setProp("og:url", abs);
  }
  if (image) setProp("og:image", image);
  if (noindex) {
    const m = document.createElement("meta"); m.name = "robots"; m.content = "noindex"; document.head.append(m);
  }
}
function setProp(p, v) {
  let m = document.querySelector(`meta[property="${p}"]`);
  if (!m) { m = document.createElement("meta"); m.setAttribute("property", p); document.head.append(m); }
  m.setAttribute("content", v);
}
