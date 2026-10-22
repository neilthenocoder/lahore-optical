import { initCommon } from "../lib/common.js";
import { $, $$, esc, formatPrice, slotHTML, icon } from "../lib/util.js";
import { listProducts, getCollections } from "../lib/data.js";
import { productUrl, priceHTML } from "../lib/card.js";
import { openOrder } from "../lib/order.js";
import { TryOn } from "../lib/tryon.js";

initCommon();

const GENDER = { men: "Men", women: "Women", unisex: "Unisex", kids: "Kids" };
const grid = $("#tryon-grid"), chips = $("#tryon-chips"), info = $("#tryon-selected");
let all = [], filter = null, tryon, selected;

async function init() {
  grid.innerHTML = `<p class="small">Loading frames…</p>`;
  const [{ rows }, cols] = await Promise.all([listProducts({ tryon: true, from: 0, to: 199 }), getCollections()]);
  all = rows;
  if (!all.length) {
    grid.innerHTML = `<p class="body">Try-on frames are being added. Meanwhile, browse <a class="link link--static" href="/frames">all frames</a>.</p>`;
    $("#tryon-stage").innerHTML = "";
    return;
  }
  const want = new URLSearchParams(location.search).get("frame");
  selected = all.find((p) => p.slug === want) || all[0];

  // chips: collection · shape · gender (only values that exist among try-on frames)
  const colIds = new Set(all.flatMap((p) => p.collection_ids || []));
  const usedCols = cols.filter((k) => colIds.has(k.id));
  const shapes = [...new Set(all.map((p) => p.shape).filter(Boolean))];
  const genders = ["men", "women", "unisex", "kids"].filter((g) => all.some((p) => p.gender === g));
  const chip = (t, v, l) => `<button class="chip" type="button" data-t="${t}" data-v="${esc(v)}" aria-pressed="false">${esc(l)}</button>`;
  chips.innerHTML = chip("all", "", "All") + usedCols.map((k) => chip("collection", k.id, k.name)).join("")
    + shapes.map((s) => chip("shape", s, s[0].toUpperCase() + s.slice(1))).join("")
    + genders.map((g) => chip("gender", g, GENDER[g])).join("");
  // Collections need the product↔collection link; in live mode we fetch it per chip.
  chips.addEventListener("click", async (e) => {
    const c = e.target.closest(".chip"); if (!c) return;
    filter = c.dataset.t === "all" ? null : { t: c.dataset.t, v: c.dataset.v };
    $$(".chip", chips).forEach((x) => x.setAttribute("aria-pressed", String(x === c)));
    if (filter?.t === "collection" && !all[0].collection_ids) {
      const { rows } = await listProducts({ tryon: true, collectionId: filter.v, from: 0, to: 199 });
      filter.ids = new Set(rows.map((r) => r.id));
    }
    paint();
  });
  $(".chip", chips).setAttribute("aria-pressed", "true");

  tryon = new TryOn($("#tryon-stage"), {
    products: all, product: selected, picker: false,
    onSelect: (p) => { selected = p; paintInfo(); },
    onOrder: (p) => openOrder(p),
  });
  paint();
  paintInfo();
}

function visible() {
  if (!filter) return all;
  if (filter.t === "collection") return all.filter((p) => filter.ids ? filter.ids.has(p.id) : (p.collection_ids || []).includes(filter.v));
  return all.filter((p) => p[filter.t] === filter.v);
}

function paint() {
  const list = visible();
  grid.innerHTML = list.length ? list.map((p) => `<button class="selector__item" type="button" data-id="${esc(p.id)}" aria-pressed="${p.id === selected?.id}">
      <div class="card__media">${slotHTML({ label: "Frame · 1:1", ar: "1 / 1", url: p.images?.[0]?.url, alt: "" })}</div>
      <div class="card__body"><span class="eyebrow card__brand">${esc(p.brand)}</span><span class="h3 card__name" style="font-size:1rem">${esc(p.name)}</span><span class="price">${priceHTML(p)}</span></div>
    </button>`).join("")
    : `<div class="empty"><p>No frames match —</p><button class="link link--static" type="button" data-clear>Clear filters</button></div>`;
}

grid.addEventListener("click", (e) => {
  if (e.target.closest("[data-clear]")) { $(".chip", chips).click(); return; }
  const b = e.target.closest("[data-id]"); if (!b) return;
  const p = all.find((x) => String(x.id) === b.dataset.id);
  selected = p;
  $$("[data-id]", grid).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  tryon.setProduct(p); // swaps the overlay instantly
  paintInfo();
  if (matchMedia("(max-width: 809px)").matches) $("#tryon-stage").scrollIntoView({ behavior: "smooth", block: "start" });
});

function paintInfo() {
  if (!selected) return;
  info.hidden = false;
  info.innerHTML = `<div><span class="eyebrow">${esc(selected.brand)}</span><p class="h3" style="margin-top:8px">${esc(selected.name)}</p><p class="price" style="margin-top:8px">${priceHTML(selected)}</p></div>
    <button class="btn btn--solid btn--block" type="button" data-order>${icon("whatsapp")}Order on WhatsApp</button>
    <a class="link" href="${productUrl(selected)}">View details →</a>`;
  $("[data-order]", info).addEventListener("click", () => openOrder(selected));
}

init().catch((e) => { console.error(e); grid.innerHTML = `<p class="body">Frames could not be loaded. Please refresh.</p>`; });
