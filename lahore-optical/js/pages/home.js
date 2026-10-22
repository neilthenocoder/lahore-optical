/*
 * LISTING DECISION — "Show more" (load-more) buttons, never infinite scroll.
 * - Baymard Institute's large-scale product-listing usability testing found
 *   "Load more" performs best overall: users see more products than with
 *   pagination, and avoid infinite scroll's problems (footer unreachable,
 *   scroll position lost on Back, no sense of where you are in the list).
 * - Infinite scroll suits casual feeds, not considered choices like eyewear.
 * - A dedicated crawlable URL per category (/frames) is what ranks in Google;
 *   content rendered only through infinite scroll is hard to crawl.
 *   (Google does not penalise footers on infinite-scroll pages; the real
 *   issues are crawlability and users not reaching the footer.)
 * - With load-more the footer stays reachable on every page.
 * Home: 12 per section (8 on small screens), "Show more" up to 24 (16),
 * then the button becomes "View all … →" to the category page.
 */
import { initCommon, observeReveal } from "../lib/common.js";
import { $, $$, esc, isSmall, reducedMotion, slotHTML, icon } from "../lib/util.js";
import { getCategories, getCollections, getFacets, listProducts, getGallery } from "../lib/data.js";
import { cardHTML, skeletonHTML } from "../lib/card.js";

initCommon();

const host = $("#product-sections");
const band = $("#tryon-band");

/* ---------- hash state: #frames.brand=Ray-Ban&sunglasses.collection=aviator ---------- */
function readHash() {
  const out = {};
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h.includes("=")) return out;
  for (const part of h.split("&")) {
    const m = part.match(/^([a-z0-9-]+)\.(collection|brand)=(.+)$/i);
    if (m) out[m[1]] = { type: m[2], value: m[3] };
  }
  return out;
}
function writeHash(state) {
  const parts = Object.entries(state).filter(([, v]) => v).map(([k, v]) => `${k}.${v.type}=${encodeURIComponent(v.value)}`);
  history.replaceState(null, "", parts.length ? "#" + parts.join("&") : location.pathname + location.search);
}
const hashState = readHash();

async function buildSections() {
  const [cats, cols] = await Promise.all([getCategories(), getCollections()]);
  const home = cats.filter((c) => c.show_on_home).sort((a, b) => a.sort_order - b.sort_order);
  host.innerHTML = home.map((c) => `<section class="section psec" id="shop-${esc(c.slug)}" aria-labelledby="h-${esc(c.slug)}" data-cat="${esc(c.slug)}">
      <div class="container">
        <div class="psec__head">
          <div class="stack"><span class="eyebrow">Shop ${esc(c.name.toLowerCase())}</span><h2 id="h-${esc(c.slug)}">${esc(c.name)}</h2></div>
          <a class="link" href="/${esc(c.slug)}" data-viewall>View all ${esc(c.name.toLowerCase())} →</a>
        </div>
        <div class="chips" role="group" aria-label="Filter ${esc(c.name)}"></div>
        <div class="grid" aria-live="polite">${skeletonHTML(isSmall() ? 4 : 8)}</div>
        <div class="psec__foot"><button class="btn btn--outline" type="button" data-more hidden>Show more</button></div>
      </div>
    </section>`).join("");

  let bandPlaced = false;
  const tasks = home.map(async (c, i) => {
    const sec = host.querySelector(`[data-cat="${c.slug}"]`);
    const ok = await initSection(sec, c, cols.filter((k) => k.category_id === c.id));
    if (!ok) sec.remove(); // only categories that have products get a section
  });
  await Promise.allSettled(tasks);

  // Try-on band sits between Frames and Sunglasses (or after the first section)
  const secs = $$(".psec", host);
  const frames = secs.find((s) => s.dataset.cat === "frames") || secs[0];
  if (frames) { frames.after(band); bandPlaced = true; }
  if (!bandPlaced) host.after(band);
  // a hairline between consecutive white product sections
  $$(".psec + .psec", host).forEach((s) => s.querySelector(".container").insertAdjacentHTML("afterbegin", '<hr class="hairline" style="margin-bottom:var(--section-y)">'));
  observeReveal(host);

  // If arriving with a #frames… hash, nudge to that section
  const first = Object.keys(hashState)[0];
  if (first) document.getElementById("shop-" + first)?.scrollIntoView({ block: "start" });
}

async function initSection(sec, cat, collections) {
  const grid = $(".grid", sec), chips = $(".chips", sec), more = $("[data-more]", sec), viewAll = $("[data-viewall]", sec);
  const per = isSmall() ? 8 : 12, max = per * 2;
  let filter = hashState[cat.slug] || null, shown = 0, total = 0, baseCount = 0;
  const nameLc = cat.name.toLowerCase();

  const query = (from, to) => {
    const f = { categoryId: cat.id, from, to };
    if (filter?.type === "brand") f.brand = filter.value;
    if (filter?.type === "collection") f.collectionId = collections.find((k) => k.slug === filter.value)?.id;
    return listProducts(f);
  };

  async function load(reset) {
    if (reset) { shown = 0; grid.innerHTML = skeletonHTML(isSmall() ? 4 : 8); grid.setAttribute("aria-busy", "true"); }
    const { rows, count } = await query(shown, shown + per - 1);
    total = count;
    if (reset) grid.innerHTML = "";
    if (!rows.length && reset) {
      grid.innerHTML = `<div class="empty"><p>No products match these filters —</p><button class="link link--static" type="button" data-clear>Clear filters</button></div>`;
      $("[data-clear]", grid).addEventListener("click", () => setFilter(null));
    }
    grid.insertAdjacentHTML("beforeend", rows.map((p) => cardHTML(p)).join(""));
    grid.removeAttribute("aria-busy");
    shown += rows.length;
    updateMore();
    return count;
  }

  function updateMore() {
    if (shown >= total) { more.hidden = true; return; }
    more.hidden = false;
    if (shown >= max) {
      more.textContent = `View all ${nameLc} →`;
      more.dataset.mode = "link";
    } else { more.textContent = "Show more"; delete more.dataset.mode; }
  }
  more.addEventListener("click", async () => {
    if (more.dataset.mode === "link") { location.href = "/" + cat.slug; return; }
    more.setAttribute("aria-busy", "true"); more.disabled = true;
    const before = grid.children.length;
    await load(false);
    more.disabled = false; more.removeAttribute("aria-busy");
    // move keyboard focus to the first newly added card
    if (grid.children[before]?.matches("a")) grid.children[before].focus({ preventScroll: true });
  });

  function setFilter(f) {
    filter = f;
    hashState[cat.slug] = f;
    writeHash(hashState);
    $$(".chip", chips).forEach((c) => c.setAttribute("aria-pressed", String(
      f ? c.dataset.type === f.type && c.dataset.value === f.value : c.dataset.type === "all")));
    load(true);
  }

  // first, unfiltered count for the "View all (n)" link
  try {
    const first = await listProducts({ categoryId: cat.id, from: 0, to: 0 });
    baseCount = first.count;
  } catch (e) { console.error(e); grid.innerHTML = '<p class="empty">Products could not be loaded. Please refresh.</p>'; return true; }
  if (!baseCount) return false;
  viewAll.textContent = `View all ${nameLc} (${baseCount}) →`;

  // chips: All · collections · brands
  let facets = { brands: [] };
  try { facets = await getFacets(cat.id); } catch {}
  const chip = (type, value, label) => `<button class="chip" type="button" data-type="${type}" data-value="${esc(value)}" aria-pressed="false">${esc(label)}</button>`;
  chips.innerHTML = chip("all", "", "All") + collections.map((k) => chip("collection", k.slug, k.name)).join("") + facets.brands.map((b) => chip("brand", b, b)).join("");
  if (chips.children.length <= 2) chips.hidden = true;
  chips.addEventListener("click", (e) => {
    const c = e.target.closest(".chip"); if (!c) return;
    setFilter(c.dataset.type === "all" ? null : { type: c.dataset.type, value: c.dataset.value });
  });
  $$(".chip", chips).forEach((c) => c.setAttribute("aria-pressed", String(
    filter ? c.dataset.type === filter.type && c.dataset.value === filter.value : c.dataset.type === "all")));

  try { await load(true); } catch (e) { console.error(e); }
  return true;
}

/* ------------------------------ gallery ticker ------------------------------ */
async function buildGallery() {
  const g = $("#gallery"), toggle = $("#gallery-toggle");
  let items = [];
  try { items = await getGallery(); } catch (e) { console.warn(e); }
  // until photos are added in admin, show placeholder slots so the layout is visible
  if (!items.length) items = Array.from({ length: 8 }, (_, i) => ({ url: "", alt: `Shop photo ${i + 1}` }));
  const set = (hidden) => `<div class="gallery__set"${hidden ? ' aria-hidden="true"' : ""}>${items.map((it, i) =>
    slotHTML({ label: `Shop photo ${i + 1} · 3:4`, ar: "3 / 4", url: it.url, alt: hidden ? "" : it.alt, w: 900, h: 1200 })).join("")}</div>`;

  if (reducedMotion()) { // static, scrollable
    g.classList.add("is-static");
    g.innerHTML = `<div class="gallery__track" style="padding-inline:var(--gutter)">${set(false)}</div>`;
    return;
  }
  g.innerHTML = `<div class="gallery__track">${set(false)}${set(true)}</div>`;
  const track = $(".gallery__track", g);
  const first = $(".gallery__set", g);
  let offset = 0, last = performance.now(), paused = false, hover = false, dragging = false, startX = 0, startOff = 0, moved = 0;
  const speed = 40; // px per second
  const width = () => first.offsetWidth + 24; // set width + gap

  function frame(t) {
    const dt = Math.min(64, t - last); last = t;
    if (!paused && !hover && !dragging) offset -= (speed * dt) / 1000;
    const w = width();
    if (w > 0) { while (-offset >= w) offset += w; while (offset > 0) offset -= w; }
    track.style.transform = `translate3d(${offset}px,0,0)`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  g.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") hover = true; });
  g.addEventListener("pointerleave", () => { hover = false; });
  g.addEventListener("pointerdown", (e) => {
    dragging = true; moved = 0; startX = e.clientX; startOff = offset;
    g.setPointerCapture(e.pointerId); g.classList.add("is-dragging");
  });
  g.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    moved = e.clientX - startX; offset = startOff + moved;
  });
  const end = () => { dragging = false; g.classList.remove("is-dragging"); };
  g.addEventListener("pointerup", end); g.addEventListener("pointercancel", end);

  toggle.hidden = false;
  toggle.addEventListener("click", () => {
    paused = !paused;
    toggle.textContent = paused ? "Play gallery" : "Pause gallery";
    toggle.setAttribute("aria-pressed", String(paused));
  });
}

buildSections().catch((e) => console.error(e));
buildGallery();
