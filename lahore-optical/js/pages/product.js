import { initCommon, observeReveal } from "../lib/common.js";
import { $, $$, esc, formatPrice, slotHTML, icon, waLink, WA_TEXT, setMeta, siteOrigin, openDialog } from "../lib/util.js";
import { getProduct, getCollections, getCategories, listProducts } from "../lib/data.js";
import { cardHTML, priceHTML, productUrl } from "../lib/card.js";
import { openOrder } from "../lib/order.js";

initCommon();

const root = $("#pdp");
const GENDER = { men: "Men", women: "Women", unisex: "Unisex", kids: "Kids" };
let product, colour = "", images = [], idx = 0;

function slugFromUrl() {
  const q = new URLSearchParams(location.search).get("slug");
  if (q) return q;
  const parts = location.pathname.split("/").filter(Boolean);
  return parts[1] || parts[0];
}

async function init() {
  const slug = slugFromUrl();
  const [p, cols, cats] = await Promise.all([getProduct(slug), getCollections(), getCategories()]);
  if (!p) return missing();
  product = p;
  const cat = cats.find((c) => c.id === p.category_id);
  const pcols = cols.filter((k) => (p.collection_ids || []).includes(k.id));
  images = (Array.isArray(p.images) && p.images.length ? p.images : [{ url: "", alt: p.name }]).slice(0, 6);
  const variants = Array.isArray(p.variants) ? p.variants.filter((v) => v.name) : [];
  colour = variants[0]?.name || "";

  // breadcrumbs
  $("#crumbs").innerHTML = `<li><a href="/">Home</a></li>${cat ? `<li><a href="/${esc(cat.slug)}">${esc(cat.name)}</a></li>` : ""}<li aria-current="page">${esc(p.name)}</li>`;

  const specs = [
    ["Frame shape", p.shape && p.shape[0].toUpperCase() + p.shape.slice(1)],
    ["Material", p.material], ["Size", p.size], ["Gender", GENDER[p.gender]],
    ["Collection", pcols.map((k) => k.name).join(", ")],
  ].filter(([, v]) => v);

  root.removeAttribute("aria-busy");
  root.innerHTML = `<div class="pdp__grid">
    <div class="pdp__media">
      <button class="gallery-main" type="button" id="main-img" aria-label="Open image 1 of ${images.length} full screen">
        ${slotHTML({ label: "Product image · 1:1", ar: "1 / 1", url: images[0].url, alt: images[0].alt || `${p.brand} ${p.name}`, priority: true, w: 1600, h: 1600 })}
      </button>
      ${images.length > 1 ? `<div class="thumbs" role="group" aria-label="Product images">${images.map((im, i) => `<button type="button" data-thumb="${i}" aria-label="Show image ${i + 1}" aria-current="${i === 0}">${slotHTML({ label: `${i + 1}`, ar: "1 / 1", url: im.url, alt: "", w: 300, h: 300 })}</button>`).join("")}</div>` : ""}
    </div>
    <div class="pdp__info">
      <div class="stack">
        <span class="eyebrow">${esc(p.brand)}</span>
        <h1 class="pdp__name">${esc(p.name)}</h1>
      </div>
      <p class="price pdp__price">${priceHTML(p)}</p>
      ${variants.length ? `<div class="field"><p class="label">Colour: <span id="colour-name">${esc(colour)}</span></p>
        <div class="swatches" role="group" aria-label="Colour">${variants.map((v, i) => `<button class="swatch" type="button" data-variant="${i}" aria-pressed="${i === 0}">${slotHTML({ ar: "1 / 1", url: v.image_url, alt: "" })}${esc(v.name)}</button>`).join("")}</div></div>` : ""}
      ${specs.length ? `<dl class="specs">${specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
      ${p.description ? `<p class="body body--long">${esc(p.description)}</p>` : ""}
      <div class="pdp__actions">
        <button class="btn btn--solid btn--block" type="button" data-order-open>${icon("whatsapp")}Order on WhatsApp</button>
        ${p.tryon_png ? `<button class="btn btn--outline btn--block" type="button" id="tryon-open">${icon("camera")}Try it on live</button>` : ""}
        <a class="link" href="${waLink(WA_TEXT.eyetest)}" target="_blank" rel="noopener">Book an eye test first</a>
      </div>
      <ul class="reassure">
        <li>2-hour delivery in Lucknow</li><li>6-day lens guarantee</li><li>Genuine brands only</li><li>Visit us at Hazratganj Gate 3</li>
      </ul>
    </div>
  </div>`;

  bind(variants);
  seo(p, cat);
  related(p);
}

function bind(variants) {
  $$("[data-order-open]").forEach((b) => b.addEventListener("click", () => openOrder(product, { colour })));
  $("#tryon-open")?.addEventListener("click", openTryOn);
  $("#main-img").addEventListener("click", () => openLightbox(idx));
  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-thumb]");
    if (t) show(+t.dataset.thumb);
    const v = e.target.closest("[data-variant]");
    if (v) {
      const vv = variants[+v.dataset.variant];
      colour = vv.name;
      $("#colour-name").textContent = colour;
      $$("[data-variant]").forEach((b) => b.setAttribute("aria-pressed", String(b === v)));
      if (vv.image_url) setMain({ url: vv.image_url, alt: `${product.name} in ${vv.name}` });
    }
  });
  swipe($("#main-img"), (d) => show((idx + d + images.length) % images.length));
}

function setMain(im) {
  $("#main-img").innerHTML = slotHTML({ label: "Product image · 1:1", ar: "1 / 1", url: im.url, alt: im.alt || product.name, priority: true, w: 1600, h: 1600 });
}
function show(i) {
  idx = i;
  setMain(images[i]);
  $("#main-img").setAttribute("aria-label", `Open image ${i + 1} of ${images.length} full screen`);
  $$("[data-thumb]").forEach((b) => b.setAttribute("aria-current", String(+b.dataset.thumb === i)));
}

/** Horizontal swipe helper (suppresses the click that follows a swipe). */
function swipe(el, cb) {
  let x0 = null, swiped = false;
  el.addEventListener("pointerdown", (e) => { x0 = e.clientX; swiped = false; });
  el.addEventListener("pointerup", (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) > 40 && images.length > 1) { swiped = true; cb(dx < 0 ? 1 : -1); }
  });
  el.addEventListener("click", (e) => { if (swiped) { e.stopImmediatePropagation(); e.preventDefault(); swiped = false; } }, true);
}

function openLightbox(start) {
  let i = start;
  const dlg = document.createElement("dialog");
  dlg.className = "lightbox";
  dlg.setAttribute("aria-label", "Product images");
  const many = images.length > 1;
  dlg.innerHTML = `<div class="lightbox__inner">
    <button class="icon-btn lightbox__close" type="button" data-x aria-label="Close">${icon("close")}</button>
    ${many ? `<button class="icon-btn lightbox__nav lightbox__prev" type="button" data-d="-1" aria-label="Previous image">${icon("arrowLeft")}</button>
    <button class="icon-btn lightbox__nav lightbox__next" type="button" data-d="1" aria-label="Next image">${icon("arrowRight")}</button>` : ""}
    <div data-stage></div>
    <p class="lightbox__count" aria-live="polite"></p></div>`;
  document.body.append(dlg);
  const paint = () => {
    const im = images[i];
    $("[data-stage]", dlg).innerHTML = slotHTML({ label: "Product image · 1:1", ar: "1 / 1", url: im.url, alt: im.alt || product.name, w: 2000, h: 2000 });
    $(".lightbox__count", dlg).textContent = `${i + 1} / ${images.length}`;
  };
  const go = (d) => { i = (i + d + images.length) % images.length; paint(); };
  dlg.addEventListener("click", (e) => {
    if (e.target.closest("[data-x]")) dlg.close();
    const d = e.target.closest("[data-d]"); if (d) go(+d.dataset.d);
  });
  dlg.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); });
  let x0 = null;
  dlg.addEventListener("pointerdown", (e) => (x0 = e.clientX));
  dlg.addEventListener("pointerup", (e) => { if (x0 != null && Math.abs(e.clientX - x0) > 40 && many) go(e.clientX < x0 ? 1 : -1); x0 = null; });
  dlg.addEventListener("close", () => { dlg.remove(); show(i); });
  paint();
  openDialog(dlg);
}

async function openTryOn() {
  const { openTryOnModal } = await import("../lib/tryon.js"); // heavy: loaded only on demand
  let list = [product];
  try {
    const { rows } = await listProducts({ tryon: true, categoryId: product.category_id, from: 0, to: 23, excludeId: product.id });
    list = [product, ...rows];
  } catch {}
  openTryOnModal(product, { products: list, onOrder: (p) => openOrder(p, { colour: p.id === product.id ? colour : "" }) });
}

function seo(p, cat) {
  const path = productUrl(p);
  const img = images[0]?.url;
  setMeta({
    title: `${p.brand} ${p.name} · ${formatPrice(p.price)} · Lahore Optical`,
    description: (p.description ? p.description.slice(0, 140) + " " : "") + `${p.brand} ${cat?.name?.toLowerCase() || "eyewear"} at Lahore Optical, Hazratganj, Lucknow. Order on WhatsApp.`,
    canonical: path,
    image: img || undefined,
  });
  const ld = {
    "@context": "https://schema.org", "@type": "Product",
    name: `${p.brand} ${p.name}`, brand: { "@type": "Brand", name: p.brand },
    sku: p.slug, description: p.description || undefined,
    image: images.map((i) => i.url).filter(Boolean),
    category: cat?.name,
    offers: {
      "@type": "Offer", price: Number(p.price).toFixed(2), priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      url: siteOrigin() + path, // product page only — there is no checkout
      seller: { "@type": "Organization", name: "Lahore Optical" },
    },
  };
  const s = document.createElement("script");
  s.type = "application/ld+json";
  s.textContent = JSON.stringify(ld);
  document.head.append(s);
}

async function related(p) {
  try {
    let rows = [];
    if (p.collection_ids?.length) rows = (await listProducts({ collectionId: p.collection_ids[0], excludeId: p.id, from: 0, to: 3 })).rows;
    if (rows.length < 4) {
      const more = (await listProducts({ categoryId: p.category_id, excludeId: p.id, from: 0, to: 7 })).rows;
      for (const r of more) if (rows.length < 4 && !rows.some((x) => x.id === r.id)) rows.push(r);
    }
    if (!rows.length) return;
    $("#related-grid").innerHTML = rows.map((r) => cardHTML(r)).join("");
    $("#related").hidden = false;
    observeReveal($("#related"));
  } catch (e) { console.warn(e); }
}

function missing() {
  root.removeAttribute("aria-busy");
  root.innerHTML = `<div class="nf"><div class="stack"><p class="display">404</p><h1 class="h2" style="margin-top:24px">This frame is out of focus.</h1>
    <p class="body">It may have moved or is no longer listed.</p><div class="actions"><a class="btn btn--solid" href="/frames">Browse Frames</a><a class="btn btn--outline" href="/">Back to Home</a></div></div></div>`;
  $("#mobile-bar")?.remove();
  document.body.style.paddingBottom = "0";
  setMeta({ title: "Product not found · Lahore Optical", noindex: true });
}

init().catch((e) => { console.error(e); missing(); });
