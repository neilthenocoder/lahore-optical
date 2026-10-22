/*
 * Category / collection listing (/frames, /sunglasses, /collections/:slug).
 * Load-more in batches of 24, never infinite scroll (see the Baymard note in
 * js/pages/home.js). ?page=N is kept in the URL with history.replaceState so
 * Back returns to the same depth; scroll position is restored from
 * sessionStorage. <noscript> pagination links keep pages crawlable.
 */
import { initCommon } from "../lib/common.js";
import { $, $$, esc, formatPrice, setMeta, debounce } from "../lib/util.js";
import { getCategories, getCollections, getFacets, listProducts } from "../lib/data.js";
import { cardHTML, skeletonHTML } from "../lib/card.js";

initCommon();
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

const BATCH = 24;
const PRICES = [
  { v: "0-3000", label: `Under ${formatPrice(3000)}`, min: null, max: 3000 },
  { v: "3000-6000", label: `${formatPrice(3000)}–${formatPrice(6000)}`, min: 3000, max: 6000 },
  { v: "6000-12000", label: `${formatPrice(6000)}–${formatPrice(12000)}`, min: 6000, max: 12000 },
  { v: "12000-", label: `${formatPrice(12000)} and above`, min: 12000, max: null },
];
const SORTS = [
  { v: "", label: "Featured" },
  { v: "newest", label: "Newest" },
  { v: "price_asc", label: "Price low–high" },
  { v: "price_desc", label: "Price high–low" },
];
const GENDER_LABEL = { men: "Men", women: "Women", unisex: "Unisex", kids: "Kids" };

const grid = $("#cat-grid"), more = $("#cat-more"), status = $("#cat-status"), countEl = $("#cat-count");
const params = new URLSearchParams(location.search);

function route() {
  const parts = location.pathname.replace(/\.html$/, "").split("/").filter(Boolean);
  if (parts[0] === "collections" && parts[1]) return { collection: parts[1] };
  if (params.get("collection")) return { collection: params.get("collection") };
  if (params.get("type")) return { type: params.get("type") };
  if (parts[0] && parts[0] !== "category") return { type: parts[0] };
  return { type: "frames" };
}

const state = {
  brand: params.get("brand") || "", shape: params.get("shape") || "", gender: params.get("gender") || "",
  price: params.get("price") || "", sort: params.get("sort") || "", collection: params.get("c") || "",
  page: Math.max(1, parseInt(params.get("page") || "1", 10) || 1),
};
let ctx = {}, shown = 0, total = 0;

const scrollKey = () => "lo-scroll:" + location.pathname + "?" + filterQuery().toString();

function filterQuery() {
  const q = new URLSearchParams();
  if (state.collection) q.set("c", state.collection);
  for (const k of ["brand", "shape", "gender", "price", "sort"]) if (state[k]) q.set(k, state[k]);
  return q;
}
function syncUrl() {
  const q = filterQuery();
  if (state.page > 1) q.set("page", String(state.page));
  const keep = new URLSearchParams(location.search);
  if (keep.get("type")) q.set("type", keep.get("type"));
  if (keep.get("collection")) q.set("collection", keep.get("collection"));
  const s = q.toString();
  history.replaceState(null, "", location.pathname + (s ? "?" + s : ""));
}

function filters() {
  const f = { sort: state.sort || "default" };
  if (ctx.category) f.categoryId = ctx.category.id;
  if (ctx.collection) f.collectionId = ctx.collection.id;
  else if (state.collection) f.collectionId = ctx.collections.find((k) => k.slug === state.collection)?.id;
  if (state.brand) f.brand = state.brand;
  if (state.shape) f.shape = state.shape;
  if (state.gender) f.gender = state.gender;
  const p = PRICES.find((x) => x.v === state.price);
  if (p) { if (p.min != null) f.priceMin = p.min; if (p.max != null) f.priceMax = p.max; }
  return f;
}

async function load(from, to, append) {
  if (!append) { grid.innerHTML = skeletonHTML(8); grid.setAttribute("aria-busy", "true"); }
  const { rows, count } = await listProducts({ ...filters(), from, to });
  total = count;
  if (!append) grid.innerHTML = "";
  if (!rows.length && !append) {
    grid.innerHTML = `<div class="empty"><p>No products match these filters —</p><button class="link link--static" type="button" id="clear-filters">Clear filters</button></div>`;
    $("#clear-filters").addEventListener("click", clearFilters);
  }
  const before = grid.children.length;
  grid.insertAdjacentHTML("beforeend", rows.map((p, i) => cardHTML(p, { level: 2, priority: !append && i < 4 })).join(""));
  grid.removeAttribute("aria-busy");
  shown = (append ? shown : 0) + rows.length;
  status.textContent = total ? `Showing ${shown} of ${total}` : "";
  more.hidden = shown >= total;
  countEl.textContent = `${total} ${total === 1 ? "product" : "products"}`;
  return before;
}

function clearFilters() {
  Object.assign(state, { brand: "", shape: "", gender: "", price: "", sort: state.sort, collection: "", page: 1 });
  $$("#filters select").forEach((s) => { if (s.name !== "sort") s.value = ""; });
  syncUrl(); load(0, BATCH - 1, false);
}

function select(name, label, options, value) {
  if (options.length < 1) return "";
  return `<div class="field-select${name === "sort" ? " filterbar__sort" : ""}">
    <label class="sr-only" for="f-${name}">${label}</label>
    <select id="f-${name}" name="${name}">${options.map((o) => `<option value="${esc(o.v)}"${o.v === value ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select>
  </div>`;
}

async function init() {
  const r = route();
  const [cats, cols] = await Promise.all([getCategories(), getCollections()]);
  if (r.collection) {
    ctx.collection = cols.find((k) => k.slug === r.collection);
    ctx.category = null;
    ctx.parent = ctx.collection && cats.find((c) => c.id === ctx.collection.category_id);
  } else ctx.category = cats.find((c) => c.slug === r.type);
  ctx.collections = ctx.category ? cols.filter((k) => k.category_id === ctx.category.id) : [];

  const title = ctx.collection?.name || ctx.category?.name;
  if (!title) return notFound();

  $("#cat-title").textContent = title;
  const crumbs = $("#crumb-current");
  if (ctx.parent) crumbs.insertAdjacentHTML("beforebegin", `<li><a href="/${esc(ctx.parent.slug)}">${esc(ctx.parent.name)}</a></li>`);
  crumbs.textContent = title;
  const path = ctx.collection ? `/collections/${ctx.collection.slug}` : `/${ctx.category.slug}`;
  setMeta({
    title: `${title} · Lahore Optical, Hazratganj, Lucknow`,
    description: `Browse genuine branded ${title.toLowerCase()} at Lahore Optical, Hazratganj, Lucknow. Order on WhatsApp, 2-hour delivery across Lucknow.`,
    canonical: path,
  });

  const facets = await getFacets(ctx.category?.id || ctx.parent?.id).catch(() => ({ brands: [], shapes: [], genders: [] }));
  const any = (l) => [{ v: "", label: l }];
  $("#filters").innerHTML = [
    ctx.collections.length ? select("c", "Collection", any("All collections").concat(ctx.collections.map((k) => ({ v: k.slug, label: k.name }))), state.collection) : "",
    facets.brands.length > 1 ? select("brand", "Brand", any("All brands").concat(facets.brands.map((b) => ({ v: b, label: b }))), state.brand) : "",
    facets.shapes.length > 1 ? select("shape", "Shape", any("All shapes").concat(facets.shapes.map((s) => ({ v: s, label: s[0].toUpperCase() + s.slice(1) }))), state.shape) : "",
    facets.genders.length > 1 ? select("gender", "Gender", any("All").concat(["men", "women", "unisex", "kids"].filter((g) => facets.genders.includes(g)).map((g) => ({ v: g, label: GENDER_LABEL[g] }))), state.gender) : "",
    select("price", "Price range", any("Any price").concat(PRICES.map(({ v, label }) => ({ v, label }))), state.price),
    select("sort", "Sort by", SORTS, state.sort),
  ].join("");

  $("#filters").addEventListener("change", (e) => {
    const s = e.target; if (!s.name) return;
    state[s.name === "c" ? "collection" : s.name] = s.value;
    state.page = 1;
    syncUrl();
    load(0, BATCH - 1, false);
  });

  // initial load: everything up to the remembered page in one range() call
  await load(0, state.page * BATCH - 1, false);
  syncUrl();
  const y = sessionStorage.getItem(scrollKey());
  if (y) requestAnimationFrame(() => window.scrollTo(0, parseInt(y, 10)));

  more.addEventListener("click", async () => {
    more.disabled = true;
    const before = await load(shown, shown + BATCH - 1, true);
    more.disabled = false;
    state.page = Math.ceil(shown / BATCH);
    syncUrl();
    grid.children[before]?.focus({ preventScroll: true });
  });

  const save = () => { try { sessionStorage.setItem(scrollKey(), String(Math.round(scrollY))); } catch {} };
  window.addEventListener("scroll", debounce(save, 150), { passive: true });
  window.addEventListener("pagehide", save);
}

function notFound() {
  $("#cat-title").textContent = "Not found";
  $("#crumb-current").textContent = "Not found";
  $("#filterbar").hidden = true;
  countEl.textContent = "";
  grid.innerHTML = `<div class="empty"><p>This collection doesn't exist or has moved —</p><a class="link link--static" href="/frames">Browse frames</a></div>`;
  setMeta({ title: "Not found · Lahore Optical", noindex: true });
}

init().catch((e) => {
  console.error(e);
  grid.innerHTML = `<div class="empty"><p>Products could not be loaded —</p><button class="link link--static" type="button" onclick="location.reload()">Try again</button></div>`;
});
