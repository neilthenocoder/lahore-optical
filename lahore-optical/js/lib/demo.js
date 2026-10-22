// ---------------------------------------------------------------------------
// DEMO DATA — used only while js/config.js has no Supabase keys.
// Product names and prices here are sample values for previewing the layout,
// not real stock. Real products are added in /admin once Supabase is connected.
// ---------------------------------------------------------------------------

export const demoCategories = [
  { id: "c1", name: "Frames", slug: "frames", sort_order: 1, show_on_home: true },
  { id: "c2", name: "Sunglasses", slug: "sunglasses", sort_order: 2, show_on_home: true },
  { id: "c3", name: "Lenses", slug: "lenses", sort_order: 3, show_on_home: true },
  { id: "c4", name: "Contact Lenses", slug: "contact-lenses", sort_order: 4, show_on_home: true },
];

export const demoCollections = [
  { id: "k1", name: "Classic", slug: "classic", category_id: "c1", sort_order: 1 },
  { id: "k2", name: "Titanium Light", slug: "titanium-light", category_id: "c1", sort_order: 2 },
  { id: "k3", name: "Bold Acetate", slug: "bold-acetate", category_id: "c1", sort_order: 3 },
  { id: "k4", name: "Kids", slug: "kids", category_id: "c1", sort_order: 4 },
  { id: "k5", name: "Aviator", slug: "aviator", category_id: "c2", sort_order: 1 },
  { id: "k6", name: "Everyday Shades", slug: "everyday-shades", category_id: "c2", sort_order: 2 },
  { id: "k7", name: "Progressive", slug: "progressive", category_id: "c3", sort_order: 1 },
  { id: "k8", name: "Blue-light", slug: "blue-light", category_id: "c3", sort_order: 2 },
  { id: "k9", name: "Daily", slug: "daily", category_id: "c4", sort_order: 1 },
  { id: "k10", name: "Monthly", slug: "monthly", category_id: "c4", sort_order: 2 },
];

/** Draws a simple transparent frame PNG so the demo try-on has something to show. */
function drawFrame(shape) {
  try {
    const c = document.createElement("canvas");
    c.width = 600; c.height = 220;
    const g = c.getContext("2d");
    g.strokeStyle = "#000"; g.fillStyle = "rgba(0,0,0,.08)"; g.lineWidth = 14; g.lineJoin = "round";
    const lens = (cx) => {
      g.beginPath();
      if (shape === "round") g.ellipse(cx, 115, 105, 95, 0, 0, Math.PI * 2);
      else if (shape === "aviator") { g.moveTo(cx - 115, 50); g.lineTo(cx + 115, 50); g.quadraticCurveTo(cx + 120, 200, cx, 200); g.quadraticCurveTo(cx - 120, 200, cx - 115, 50); }
      else g.rect(cx - 115, 50, 230, 135);
      g.fill(); g.stroke();
    };
    lens(155); lens(445);
    g.beginPath(); g.moveTo(270, 95); g.quadraticCurveTo(300, 70, 330, 95); g.stroke();
    g.beginPath(); g.moveTo(40, 80); g.lineTo(5, 70); g.moveTo(560, 80); g.lineTo(595, 70); g.stroke();
    return c.toDataURL("image/png");
  } catch { return null; }
}
let pngs = null;
const png = (shape) => {
  pngs ??= { rectangle: drawFrame("rectangle"), round: drawFrame("round"), aviator: drawFrame("aviator") };
  return pngs[shape] || pngs.rectangle;
};

const FRAME_BRANDS = ["Ray-Ban", "Carrera", "Silhouette", "Prada", "Gucci", "Armani", "Burberry", "Tommy Hilfiger", "Calvin Klein", "Police", "Fossil", "Xford", "Steppers", "Swarovski"];
const SUN_BRANDS = ["Ray-Ban", "Carrera", "Prada", "Gucci", "Police", "Burberry"];
const LENS_BRANDS = ["ZEISS", "Essilor", "Shamir", "Indian Optics", "Seto"];
const CL_BRANDS = ["CooperVision", "Alcon", "FreshLook", "Bausch + Lomb", "Purecon", "Air Optix"];
const SHAPES = ["rectangle", "round", "square", "cat-eye", "aviator"];
const GENDERS = ["unisex", "men", "women", "unisex", "kids"];
const PRICES = [2400, 3200, 4500, 5800, 7400, 9900, 12500, 16800];

function make(cat, n, brands, label, colls, opts = {}) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const shape = opts.shapes ? opts.shapes[i % opts.shapes.length] : SHAPES[i % SHAPES.length];
    const price = (opts.prices || PRICES)[i % (opts.prices || PRICES).length];
    const tryable = opts.tryon && (i % 3 !== 0);
    const id = `${cat}-${i}`;
    const name = `${label} ${String(i).padStart(2, "0")}`;
    out.push({
      id, slug: `${cat}-demo-${String(i).padStart(2, "0")}`, name, brand: brands[i % brands.length],
      category_id: cat, price, compare_at_price: i % 5 === 0 ? Math.round(price * 1.18 / 100) * 100 : null,
      description: "Sample product shown in demo mode. Connect Supabase and add real products in the admin panel.",
      shape: opts.noShape ? null : shape, material: opts.material || null, size: opts.size || null,
      gender: opts.noGender ? null : GENDERS[i % GENDERS.length],
      images: i % 2 ? [{ url: "", alt: name }, { url: "", alt: name + " side" }] : [{ url: "", alt: name }],
      variants: opts.variants ? [{ name: "Black", image_url: "" }, { name: "Tortoise", image_url: "" }, { name: "Gold", image_url: "" }] : [],
      get tryon_png() { return tryable ? png(shape === "round" ? "round" : shape === "aviator" ? "aviator" : "rectangle") : null; },
      tryon_scale: 2.1, tryon_offset_y: 0,
      is_active: true, is_featured: i <= 2, sort_order: i,
      created_at: new Date(Date.now() - i * 86400000).toISOString(),
      collection_ids: [colls[i % colls.length]],
    });
  }
  return out;
}

export const demoProducts = [
  ...make("c1", 30, FRAME_BRANDS, "Demo Frame", ["k1", "k2", "k3", "k4"], { tryon: true, variants: true, material: "Acetate", size: "52-18-145" }),
  ...make("c2", 14, SUN_BRANDS, "Demo Sunglass", ["k5", "k6"], { tryon: true, shapes: ["aviator", "rectangle", "round"], material: "Metal", size: "58-14-140" }),
  ...make("c3", 8, LENS_BRANDS, "Demo Lens", ["k7", "k8"], { noShape: true, noGender: true, prices: [1800, 3500, 6200, 9800] }),
  ...make("c4", 8, CL_BRANDS, "Demo Contact Lens", ["k9", "k10"], { noShape: true, noGender: true, prices: [900, 1450, 2200] }),
];

export const demoOffers = [
  { id: "o1", text: "Demo offer text — manage offers in the admin panel", link: null },
  { id: "o2", text: "2-hour delivery across Lucknow", link: "/#guarantee" },
];

export const demoGallery = Array.from({ length: 8 }, (_, i) => ({ id: "g" + i, url: "", alt: "Shop photo " + (i + 1) }));
