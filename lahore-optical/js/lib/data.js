// ---------------------------------------------------------------------------
// Data layer. Public pages only ever use the ANON key; Row Level Security in
// Supabase decides what anon can read (active products, visible gallery…)
// and that anon may only INSERT inquiries.
// Listings fetch only the columns a card needs and page with range().
// ---------------------------------------------------------------------------
import { CONFIG, DEMO_MODE } from "../config.js";

export { DEMO_MODE };

/** Default values for every editable site_content key (mirrors schema.sql seed). */
export const SITE_DEFAULTS = {
  logo: { type: "image", value: "" },
  hero_image: { type: "image", value: "" },
  hero_h1: { type: "text", value: "See well. Look better." },
  hero_subline: { type: "text", value: "500+ genuine frames, expert eye tests and 2-hour delivery across Lucknow." },
  tryon_band_media: { type: "image", value: "" },
  eyecare_image: { type: "image", value: "" },
  visit_image: { type: "image", value: "" },
  legacy_image: { type: "image", value: "" },
  review_quote_1: { type: "text", value: "[REVIEW QUOTE]" },
  review_author_1: { type: "text", value: "[REVIEWER NAME]" },
  review_quote_2: { type: "text", value: "[REVIEW QUOTE]" },
  review_author_2: { type: "text", value: "[REVIEWER NAME]" },
  review_quote_3: { type: "text", value: "[REVIEW QUOTE]" },
  review_author_3: { type: "text", value: "[REVIEWER NAME]" },
  opening_hours: { type: "text", value: "[OPENING HOURS]" },
  email: { type: "text", value: "[EMAIL]" },
  instagram_url: { type: "url", value: "" },
  facebook_url: { type: "url", value: "" },
  youtube_url: { type: "url", value: "" },
  google_reviews_url: { type: "url", value: "" },
  maps_url: { type: "url", value: "" },
};

let clientPromise;
export function getClient(opts = {}) {
  if (DEMO_MODE) return Promise.resolve(null);
  clientPromise ??= import(CONFIG.supabaseModule).then(({ createClient }) =>
    createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: { persistSession: !!opts.persist, autoRefreshToken: !!opts.persist },
    })
  );
  return clientPromise;
}

let demoMod;
const demo = () => (demoMod ??= import("./demo.js"));

const memo = new Map();
const once = (key, fn) => { if (!memo.has(key)) memo.set(key, fn().catch((e) => { memo.delete(key); throw e; })); return memo.get(key); };

const CARD_COLS = "id,slug,name,brand,price,compare_at_price,images,tryon_png,category_id,shape,gender,created_at";

/* ----------------------------- categories ----------------------------- */
export function getCategories() {
  return once("cats", async () => {
    if (DEMO_MODE) return (await demo()).demoCategories;
    const sb = await getClient();
    const { data, error } = await sb.from("categories").select("id,name,slug,sort_order,show_on_home").order("sort_order");
    if (error) throw error;
    return data;
  });
}
export async function getCategory(slug) {
  return (await getCategories()).find((c) => c.slug === slug) || null;
}

export function getCollections() {
  return once("cols", async () => {
    if (DEMO_MODE) return (await demo()).demoCollections;
    const sb = await getClient();
    const { data, error } = await sb.from("collections").select("id,name,slug,category_id,sort_order").order("sort_order");
    if (error) throw error;
    return data;
  });
}

/* ----------------------------- products ----------------------------- */
/**
 * @param {object} f  filters: categoryId, collectionId, brand, shape, gender,
 *                    priceMin, priceMax, sort ('default'|'newest'|'price_asc'|'price_desc'),
 *                    tryon (bool), featured (bool), excludeId, from, to
 * @returns {Promise<{rows: any[], count: number}>}
 */
export async function listProducts(f = {}) {
  const from = f.from ?? 0, to = f.to ?? 11;
  const cats = await getCategories();
  const catSlug = (id) => cats.find((c) => c.id === id)?.slug || "frames";

  if (DEMO_MODE) {
    let rows = (await demo()).demoProducts.filter((p) => p.is_active);
    if (f.categoryId) rows = rows.filter((p) => p.category_id === f.categoryId);
    if (f.collectionId) rows = rows.filter((p) => p.collection_ids.includes(f.collectionId));
    if (f.brand) rows = rows.filter((p) => p.brand === f.brand);
    if (f.shape) rows = rows.filter((p) => p.shape === f.shape);
    if (f.gender) rows = rows.filter((p) => p.gender === f.gender);
    if (f.priceMin != null) rows = rows.filter((p) => p.price >= f.priceMin);
    if (f.priceMax != null) rows = rows.filter((p) => p.price <= f.priceMax);
    if (f.tryon) rows = rows.filter((p) => p.tryon_png);
    if (f.featured) rows = rows.filter((p) => p.is_featured);
    if (f.excludeId) rows = rows.filter((p) => p.id !== f.excludeId);
    rows = sortRows(rows, f.sort);
    return { rows: rows.slice(from, to + 1).map((p) => ({ ...p, category_slug: catSlug(p.category_id) })), count: rows.length };
  }

  const sb = await getClient();
  let sel = CARD_COLS + (f.collectionId ? ",product_collections!inner(collection_id)" : "") + ",tryon_scale,tryon_offset_y";
  let q = sb.from("products").select(sel, { count: "exact" }).eq("is_active", true);
  if (f.categoryId) q = q.eq("category_id", f.categoryId);
  if (f.collectionId) q = q.eq("product_collections.collection_id", f.collectionId);
  if (f.brand) q = q.eq("brand", f.brand);
  if (f.shape) q = q.eq("shape", f.shape);
  if (f.gender) q = q.eq("gender", f.gender);
  if (f.priceMin != null) q = q.gte("price", f.priceMin);
  if (f.priceMax != null) q = q.lte("price", f.priceMax);
  if (f.tryon) q = q.not("tryon_png", "is", null);
  if (f.featured) q = q.eq("is_featured", true);
  if (f.excludeId) q = q.neq("id", f.excludeId);
  switch (f.sort) {
    case "newest": q = q.order("created_at", { ascending: false }); break;
    case "price_asc": q = q.order("price", { ascending: true }); break;
    case "price_desc": q = q.order("price", { ascending: false }); break;
    default: q = q.order("sort_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
  }
  const { data, error, count } = await q.range(from, to);
  if (error) throw error;
  return { rows: data.map((p) => ({ ...p, category_slug: catSlug(p.category_id) })), count: count ?? data.length };
}

function sortRows(rows, sort) {
  const r = [...rows];
  if (sort === "newest") r.sort((a, b) => b.created_at.localeCompare(a.created_at));
  else if (sort === "price_asc") r.sort((a, b) => a.price - b.price);
  else if (sort === "price_desc") r.sort((a, b) => b.price - a.price);
  else r.sort((a, b) => (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9));
  return r;
}

/** Distinct brands and shapes for a category (small column-only query). */
export function getFacets(categoryId) {
  return once("facets:" + (categoryId || "all"), async () => {
    let rows;
    if (DEMO_MODE) rows = (await demo()).demoProducts.filter((p) => !categoryId || p.category_id === categoryId);
    else {
      const sb = await getClient();
      let q = sb.from("products").select("brand,shape,gender").eq("is_active", true).limit(2000);
      if (categoryId) q = q.eq("category_id", categoryId);
      const { data, error } = await q;
      if (error) throw error;
      rows = data;
    }
    const uniq = (k) => [...new Set(rows.map((r) => r[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return { brands: uniq("brand"), shapes: uniq("shape"), genders: uniq("gender") };
  });
}

export async function getProduct(slug) {
  const cats = await getCategories();
  let p;
  if (DEMO_MODE) {
    p = (await demo()).demoProducts.find((x) => x.slug === slug && x.is_active);
    if (p) p = { ...p };
  } else {
    const sb = await getClient();
    const { data, error } = await sb.from("products").select("*, product_collections(collection_id)").eq("slug", slug).eq("is_active", true).maybeSingle();
    if (error) throw error;
    p = data;
    if (p) p.collection_ids = (p.product_collections || []).map((x) => x.collection_id);
  }
  if (!p) return null;
  p.category_slug = cats.find((c) => c.id === p.category_id)?.slug || "frames";
  return p;
}

/* ----------------------------- content ----------------------------- */
export function getSiteContent() {
  return once("content", async () => {
    const out = Object.fromEntries(Object.entries(SITE_DEFAULTS).map(([k, v]) => [k, v.value]));
    if (DEMO_MODE) return out;
    const sb = await getClient();
    const { data, error } = await sb.from("site_content").select("key,value");
    if (error) throw error;
    for (const r of data) if (r.value != null && r.value !== "") out[r.key] = r.value;
    return out;
  });
}

export function getOffers() {
  return once("offers", async () => {
    if (DEMO_MODE) return (await demo()).demoOffers;
    const sb = await getClient();
    const { data, error } = await sb.from("offers").select("id,text,link,starts_at,ends_at").eq("active", true).order("sort_order");
    if (error) throw error;
    const now = Date.now();
    return data.filter((o) => (!o.starts_at || Date.parse(o.starts_at) <= now) && (!o.ends_at || Date.parse(o.ends_at) >= now));
  });
}

export function getGallery() {
  return once("gallery", async () => {
    if (DEMO_MODE) return (await demo()).demoGallery;
    const sb = await getClient();
    const { data, error } = await sb.from("gallery_images").select("id,url,alt").eq("visible", true).order("sort_order");
    if (error) throw error;
    return data;
  });
}

/* ----------------------------- inquiries ----------------------------- */
/** Anon may only INSERT (no returning select — RLS forbids reading it back). */
export async function createInquiry(row) {
  if (DEMO_MODE) { console.info("[demo] inquiry", row); return; }
  const sb = await getClient();
  const { error } = await sb.from("inquiries").insert(row);
  if (error) throw error;
}

export async function uploadPrescription(path, file) {
  if (DEMO_MODE) { console.info("[demo] prescription upload skipped", path); return; }
  const sb = await getClient();
  const { error } = await sb.storage.from("prescriptions").upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });
  if (error) throw error;
}
