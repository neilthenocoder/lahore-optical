import { esc, formatPrice, slotHTML } from "./util.js";

export const productUrl = (p) => `/${p.category_slug || "frames"}/${p.slug}`;

export function priceHTML(p) {
  const was = p.compare_at_price && Number(p.compare_at_price) > Number(p.price)
    ? ` <s><span class="sr-only">Was </span>${formatPrice(p.compare_at_price)}</s>` : "";
  return `<span><span class="sr-only">Price </span>${formatPrice(p.price)}</span>${was}`;
}

/** The whole card is a single link to the product page. */
export function cardHTML(p, { level = 3, priority = false } = {}) {
  const imgs = Array.isArray(p.images) ? p.images : [];
  const main = imgs[0] || {}, alt = imgs[1];
  const h = `h${level}`;
  return `<a class="card" href="${productUrl(p)}">
    <div class="card__media">
      ${p.tryon_png ? '<span class="card__tag">Try on</span>' : ""}
      ${slotHTML({ label: "Product · 1:1", ar: "1 / 1", url: main.url, alt: main.alt || `${p.brand} ${p.name}`, priority })}
      ${alt ? slotHTML({ label: "Image 2 · 1:1", ar: "1 / 1", url: alt.url, alt: "", cls: "slot--alt" }) : ""}
    </div>
    <div class="card__body">
      <span class="eyebrow card__brand">${esc(p.brand)}</span>
      <${h} class="h3 card__name">${esc(p.name)}</${h}>
      <p class="price">${priceHTML(p)}</p>
    </div>
  </a>`;
}

export function skeletonHTML(n) {
  return Array.from({ length: n }, () => `<div class="card skeleton" aria-hidden="true">
    <div class="card__media"><div class="slot" style="--ar:1 / 1"></div></div>
    <div class="card__body"><div class="skeleton-line"></div><div class="skeleton-line"></div></div>
  </div>`).join("");
}
