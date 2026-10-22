// Netlify Function: /sitemap-products.xml — every active product, category and
// collection, read from Supabase with the public anon key (RLS applies).
// Set SUPABASE_URL and SUPABASE_ANON_KEY in Netlify → Site configuration →
// Environment variables. Functions deploy with Git or Netlify CLI deploys
// (not drag-and-drop) — see README for the manual alternative.
export default async (req) => {
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return new Response("Sitemap not configured", { status: 500 });
  const origin = (process.env.SITE_URL || process.env.URL || new URL(req.url).origin).replace(/\/$/, "");
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const get = async (path) => {
    const r = await fetch(`${base}/rest/v1/${path}`, { headers });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  };
  try {
    const [cats, cols] = await Promise.all([get("categories?select=id,slug"), get("collections?select=slug")]);
    const products = [];
    for (let off = 0; ; off += 1000) {
      const page = await get(`products?select=slug,category_id,updated_at&is_active=eq.true&order=created_at&limit=1000&offset=${off}`);
      products.push(...page);
      if (page.length < 1000) break;
    }
    const slugOf = (id) => cats.find((c) => c.id === id)?.slug || "frames";
    const u = (loc, lastmod) => `  <url><loc>${origin}${loc}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ""}</url>`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...cats.map((c) => u(`/${c.slug}`)), ...cols.map((c) => u(`/collections/${c.slug}`)),
   ...products.map((p) => u(`/${slugOf(p.category_id)}/${p.slug}`, p.updated_at))].join("\n")}
</urlset>`;
    return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
  } catch (e) {
    return new Response(`Sitemap error: ${e.message}`, { status: 502 });
  }
};
