// Shared behaviour for every public page: header drawer, offer ticker,
// editable site content, reveal-on-scroll, back links, footer year.
import { $, $$, esc, icon, fillSlot, reducedMotion, initBackLinks } from "./util.js";
import { getOffers, getSiteContent, DEMO_MODE } from "./data.js";

let revealObserver;
export function observeReveal(root = document) {
  const els = $$(".reveal:not(.is-in)", root);
  if (!("IntersectionObserver" in window) || reducedMotion()) { els.forEach((e) => e.classList.add("is-in")); return; }
  revealObserver ??= new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add("is-in"); revealObserver.unobserve(en.target); }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
  els.forEach((e) => revealObserver.observe(e));
}

/* ------------------------------ drawer ------------------------------ */
function initDrawer() {
  const btn = $(".burger"), drawer = $("#drawer");
  if (!btn || !drawer) return;
  const focusables = () => $$('a[href], button:not([disabled])', drawer);
  const open = () => {
    drawer.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    document.body.classList.add("is-locked");
    focusables()[1]?.focus();
    document.addEventListener("keydown", onKey);
  };
  const close = (restore = true) => {
    drawer.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    document.body.classList.remove("is-locked");
    document.removeEventListener("keydown", onKey);
    if (restore) btn.focus();
  };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    if (e.key === "Tab") {
      const f = focusables(); const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  btn.addEventListener("click", open);
  $("[data-drawer-close]", drawer)?.addEventListener("click", () => close());
  drawer.addEventListener("click", (e) => { if (e.target.closest("a")) close(false); });
  window.matchMedia("(min-width: 810px)").addEventListener("change", (m) => { if (m.matches && !drawer.hidden) close(false); });
}

/* ------------------------------ ticker ------------------------------ */
async function initTicker() {
  const el = $("#ticker");
  if (!el) return;
  let offers = [];
  try { offers = await getOffers(); } catch (e) { console.warn("offers", e); }
  if (!offers.length) { el.hidden = true; return; } // hidden entirely with no active offers

  const item = (o, hidden) => {
    const t = esc(o.text);
    const inner = o.link ? `<a href="${esc(o.link)}"${hidden ? ' tabindex="-1"' : ""}>${t}</a>` : t;
    return `<span class="ticker__item">${inner}</span><span class="ticker__sep" aria-hidden="true">·</span>`;
  };
  const items = (hidden) => offers.map((o) => item(o, hidden)).join("");
  el.innerHTML = `
    <span class="ticker__tag">OFFER</span>
    <div class="ticker__viewport">
      <div class="ticker__track">
        <div class="ticker__group">${items(false)}</div>
        <div class="ticker__group" aria-hidden="true">${items(true)}</div>
      </div>
    </div>
    <button class="ticker__pause" type="button" aria-pressed="false" aria-label="Pause offers">${icon("pause")}</button>`;
  el.hidden = false;

  // make each group at least as wide as the viewport so the loop is seamless
  const vp = $(".ticker__viewport", el);
  const [g1, g2] = $$(".ticker__group", el);
  let guard = 0;
  while (g1.scrollWidth < vp.clientWidth && guard++ < 8) {
    g1.insertAdjacentHTML("beforeend", items(true).replace(/class="ticker__item"/g, 'class="ticker__item" aria-hidden="true"'));
    g2.insertAdjacentHTML("beforeend", items(true));
  }
  el.style.setProperty("--dur", Math.max(20, g1.scrollWidth / 50) + "s");

  const pause = $(".ticker__pause", el);
  pause.addEventListener("click", () => {
    const p = el.classList.toggle("is-paused");
    pause.setAttribute("aria-pressed", String(p));
    pause.setAttribute("aria-label", p ? "Play offers" : "Pause offers");
    pause.innerHTML = icon(p ? "play" : "pause");
  });
  if (reducedMotion()) pause.hidden = true;
  setTopHeight();
}

function setTopHeight() {
  const t = $("#ticker");
  document.documentElement.style.setProperty("--ticker-h", t && !t.hidden ? t.offsetHeight + "px" : "0px");
}

/* --------------------------- site content --------------------------- */
const PLACEHOLDER = { instagram_url: "[INSTAGRAM_URL]", facebook_url: "[FACEBOOK_URL]", youtube_url: "[YOUTUBE_URL]" };

export async function applySiteContent(root = document) {
  let c;
  try { c = await getSiteContent(); } catch (e) { console.warn("site content", e); return {}; }
  $$("[data-content]", root).forEach((el) => {
    const v = c[el.dataset.content];
    if (v) el.textContent = v;
  });
  $$("[data-slot]", root).forEach((el) => {
    const v = c[el.dataset.slot];
    if (v) fillSlot(el, v, el.dataset.alt || "");
  });
  $$("[data-href]", root).forEach((el) => {
    const key = el.dataset.href, v = c[key];
    if (v) el.href = v;
    else if (PLACEHOLDER[key] && !el.dataset.phDone) {
      el.dataset.phDone = "1";
      el.insertAdjacentHTML("beforeend", ` <span class="ph">${PLACEHOLDER[key]}</span>`);
      el.removeAttribute("target");
    }
  });
  $$("[data-content-mail]", root).forEach((el) => {
    const v = c[el.dataset.contentMail];
    if (v && !v.startsWith("[")) el.href = "mailto:" + v; else el.removeAttribute("href");
  });
  return c;
}

/* ------------------------------ init ------------------------------ */
export function initCommon() {
  $$("[data-year]").forEach((e) => (e.textContent = new Date().getFullYear()));
  initDrawer();
  initBackLinks();
  initTicker();
  applySiteContent();
  observeReveal();
  window.addEventListener("resize", setTopHeight, { passive: true });
  if (DEMO_MODE) {
    const n = document.createElement("div");
    n.className = "demo-note";
    n.textContent = "Demo mode: sample products shown. Add your Supabase keys in js/config.js to go live.";
    $("#site-top")?.after(n);
  }
}
