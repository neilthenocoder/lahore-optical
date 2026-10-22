import { state, esc, toast, fail, confirmDialog, uploadImage, sortable, handleHTML, parseCSV, csvCell, download } from "./kit.js";
import { formatPrice, slugify, siteOrigin } from "../lib/util.js";

const PER = 25;
const GENDERS = ["", "men", "women", "unisex", "kids"];
let cats = [], cols = [];
const list = { page: 0, q: "", cat: "", col: "", active: "", selected: new Set() };

async function loadTaxonomy() {
  const sb = state.sb;
  const [a, b] = await Promise.all([
    sb.from("categories").select("id,name,slug").order("sort_order"),
    sb.from("collections").select("id,name,slug,category_id").order("sort_order"),
  ]);
  if (a.error) throw a.error; if (b.error) throw b.error;
  cats = a.data; cols = b.data;
}

export async function render(main, args) {
  await loadTaxonomy();
  if (args[0] === "new") return editor(main, null);
  if (args[0] === "edit" && args[1]) return editor(main, args[1]);
  return listView(main);
}

/* ================================ LIST ================================ */
async function listView(main) {
  main.innerHTML = `<h1>Products</h1>
    <div class="toolbar">
      <input class="input grow" type="search" id="q" placeholder="Search name, brand or slug" aria-label="Search products" value="${esc(list.q)}">
      <select class="input" id="f-cat" aria-label="Filter by category"><option value="">All categories</option>${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select>
      <select class="input" id="f-col" aria-label="Filter by collection"><option value="">All collections</option>${cols.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select>
      <select class="input" id="f-active" aria-label="Filter by status"><option value="">Active + inactive</option><option value="1">Active</option><option value="0">Inactive</option></select>
      <a class="btn btn--solid" href="#products/new">New product</a>
    </div>
    <div class="toolbar">
      <button class="btn btn--outline" type="button" id="csv-import">Import CSV</button>
      <button class="btn btn--outline" type="button" id="csv-template">Download CSV template</button>
      <button class="btn btn--outline" type="button" id="sitemap">Download sitemap.xml</button>
      <input type="file" id="csv-file" accept=".csv,text/csv" hidden>
    </div>
    <div class="bulkbar" id="bulk" hidden><span id="bulk-n"></span>
      <button class="btn btn--outline btn-sm" type="button" data-bulk="activate">Activate</button>
      <button class="btn btn--outline btn-sm" type="button" data-bulk="deactivate">Deactivate</button>
      <button class="btn btn--outline btn-sm" type="button" data-bulk="delete">Delete</button></div>
    <div class="table-wrap"><table class="table"><thead><tr>
      <th><input type="checkbox" id="all" aria-label="Select all on this page"></th><th>Image</th><th>Name</th><th>Brand</th><th>Category</th><th>Price</th><th>Active</th><th>Featured</th><th>Try-on</th><th></th>
    </tr></thead><tbody id="rows"><tr><td colspan="10">Loading…</td></tr></tbody></table></div>
    <div class="pager" id="pager"></div>`;
  main.querySelector("#f-cat").value = list.cat;
  main.querySelector("#f-col").value = list.col;
  main.querySelector("#f-active").value = list.active;

  const reload = () => { list.page = 0; list.selected.clear(); fetchRows(main); };
  let t; main.querySelector("#q").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { list.q = e.target.value.trim(); reload(); }, 250); });
  main.querySelector("#f-cat").addEventListener("change", (e) => { list.cat = e.target.value; reload(); });
  main.querySelector("#f-col").addEventListener("change", (e) => { list.col = e.target.value; reload(); });
  main.querySelector("#f-active").addEventListener("change", (e) => { list.active = e.target.value; reload(); });
  main.querySelector("#csv-template").addEventListener("click", csvTemplate);
  main.querySelector("#csv-import").addEventListener("click", () => main.querySelector("#csv-file").click());
  main.querySelector("#csv-file").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) importCSV(f, main); });
  main.querySelector("#sitemap").addEventListener("click", sitemap);
  main.querySelector("#bulk").addEventListener("click", (e) => { const b = e.target.closest("[data-bulk]"); if (b) bulk(b.dataset.bulk, main); });
  main.querySelector("#all").addEventListener("change", (e) => {
    main.querySelectorAll("[data-sel]").forEach((c) => { c.checked = e.target.checked; c.checked ? list.selected.add(c.value) : list.selected.delete(c.value); });
    bulkBar(main);
  });
  main.querySelector("#rows").addEventListener("change", (e) => onRowChange(e, main));
  fetchRows(main);
}

async function fetchRows(main) {
  const sb = state.sb;
  let sel = "id,slug,name,brand,category_id,price,is_active,is_featured,tryon_png,images" + (list.col ? ",product_collections!inner(collection_id)" : "");
  let q = sb.from("products").select(sel, { count: "exact" });
  if (list.q) { const s = list.q.replace(/[,%()]/g, " "); q = q.or(`name.ilike.%${s}%,brand.ilike.%${s}%,slug.ilike.%${s}%`); }
  if (list.cat) q = q.eq("category_id", list.cat);
  if (list.col) q = q.eq("product_collections.collection_id", list.col);
  if (list.active) q = q.eq("is_active", list.active === "1");
  q = q.order("sort_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).range(list.page * PER, list.page * PER + PER - 1);
  const { data, error, count } = await q;
  const body = main.querySelector("#rows");
  if (error) { body.innerHTML = `<tr><td colspan="10">${esc(error.message)}</td></tr>`; return; }
  if (!data.length) { body.innerHTML = `<tr><td colspan="10"><div class="empty-state">No products yet. <a class="link link--static" href="#products/new">Add your first product</a> or import a CSV.</div></td></tr>`; }
  else body.innerHTML = data.map((p) => {
    const img = p.images?.[0]?.url;
    const cat = cats.find((c) => c.id === p.category_id);
    return `<tr data-id="${p.id}">
      <td><input type="checkbox" data-sel value="${p.id}" ${list.selected.has(p.id) ? "checked" : ""} aria-label="Select ${esc(p.name)}"></td>
      <td><div class="thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ""}</div></td>
      <td class="wrap"><a class="link link--static" href="#products/edit/${p.id}">${esc(p.name)}</a><br><span class="hint">${esc(p.slug)}</span></td>
      <td>${esc(p.brand)}</td><td>${esc(cat?.name || "—")}</td><td>${formatPrice(p.price)}</td>
      <td><input type="checkbox" data-flag="is_active" ${p.is_active ? "checked" : ""} aria-label="Active"></td>
      <td><input type="checkbox" data-flag="is_featured" ${p.is_featured ? "checked" : ""} aria-label="Featured"></td>
      <td>${p.tryon_png ? '<span aria-label="Try-on ready">✓</span>' : ""}</td>
      <td><a class="btn btn--outline btn-sm" href="#products/edit/${p.id}">Edit</a></td></tr>`;
  }).join("");
  const pages = Math.max(1, Math.ceil((count || 0) / PER));
  main.querySelector("#pager").innerHTML = `<span>${count || 0} products · page ${list.page + 1} of ${pages}</span>
    <button class="btn btn--outline btn-sm" type="button" data-pg="-1" ${list.page === 0 ? "disabled" : ""}>Previous</button>
    <button class="btn btn--outline btn-sm" type="button" data-pg="1" ${list.page + 1 >= pages ? "disabled" : ""}>Next</button>`;
  main.querySelector("#pager").onclick = (e) => { const b = e.target.closest("[data-pg]"); if (b) { list.page += +b.dataset.pg; fetchRows(main); } };
  bulkBar(main);
}

async function onRowChange(e, main) {
  const c = e.target;
  if (c.matches("[data-sel]")) { c.checked ? list.selected.add(c.value) : list.selected.delete(c.value); bulkBar(main); return; }
  if (c.matches("[data-flag]")) { // optimistic toggle
    const id = c.closest("tr").dataset.id, val = c.checked;
    const { error } = await state.sb.from("products").update({ [c.dataset.flag]: val }).eq("id", id);
    if (error) { c.checked = !val; fail(error, "Not saved"); } else toast("Saved");
  }
}

function bulkBar(main) {
  const n = list.selected.size;
  main.querySelector("#bulk").hidden = !n;
  main.querySelector("#bulk-n").textContent = `${n} selected`;
}

async function bulk(action, main) {
  const ids = [...list.selected];
  if (!ids.length) return;
  const sb = state.sb;
  if (action === "delete") {
    if (!(await confirmDialog(`Delete ${ids.length} product${ids.length > 1 ? "s" : ""}?`))) return;
    const { error } = await sb.from("products").delete().in("id", ids);
    if (error) return fail(error, "Delete failed");
    toast(`Deleted ${ids.length}`);
  } else {
    const { error } = await sb.from("products").update({ is_active: action === "activate" }).in("id", ids);
    if (error) return fail(error, "Update failed");
    toast(`Updated ${ids.length}`);
  }
  list.selected.clear();
  fetchRows(main);
}

/* ================================ EDITOR ================================ */
async function editor(main, id) {
  const sb = state.sb;
  let p = {
    id: crypto.randomUUID(), name: "", slug: "", brand: "", category_id: cats[0]?.id || "", price: "", compare_at_price: "",
    description: "", shape: "", material: "", size: "", gender: "", images: [], variants: [], tryon_png: null,
    tryon_scale: 2.1, tryon_offset_y: 0, is_active: true, is_featured: false, sort_order: 0,
  };
  let selectedCols = new Set();
  const isNew = !id;
  if (id) {
    const { data, error } = await sb.from("products").select("*, product_collections(collection_id)").eq("id", id).maybeSingle();
    if (error || !data) { main.innerHTML = `<p class="body">Product not found. <a class="link link--static" href="#products">Back to products</a></p>`; return; }
    p = { ...p, ...data, images: data.images || [], variants: data.variants || [] };
    selectedCols = new Set((data.product_collections || []).map((x) => x.collection_id));
  }
  let slugTouched = !isNew;

  main.innerHTML = `<p><a class="link" href="#products">← Products</a></p>
  <h1>${isNew ? "New product" : "Edit product"}</h1>
  <form class="form" id="pf" novalidate>
    <section class="panel"><h2>Basics</h2>
      <div class="form-grid">
        <div class="field"><label for="name">Name *</label><input id="name" type="text" required maxlength="140" value="${esc(p.name)}"></div>
        <div class="field"><label for="slug">Slug *</label><input id="slug" type="text" required maxlength="100" pattern="[a-z0-9-]+" value="${esc(p.slug)}"><span class="hint">Used in the URL. Lowercase letters, numbers and dashes.</span></div>
        <div class="field"><label for="brand">Brand *</label><input id="brand" type="text" required maxlength="80" value="${esc(p.brand)}" list="brand-list"></div>
        <div class="field"><label for="category_id">Category *</label><select id="category_id" required>${cats.map((c) => `<option value="${c.id}" ${c.id === p.category_id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
        <div class="field"><label for="price">Price (₹) *</label><input id="price" type="number" min="0" step="1" required value="${esc(p.price)}"></div>
        <div class="field"><label for="compare_at_price">Compare-at price (₹)</label><input id="compare_at_price" type="number" min="0" step="1" value="${esc(p.compare_at_price ?? "")}"><span class="hint">Shown struck through when higher than the price.</span></div>
        <div class="field full"><label for="description">Description</label><textarea id="description" maxlength="2000">${esc(p.description || "")}</textarea></div>
      </div>
      <div class="field"><span class="label">Collections</span><div class="multi" id="cols"></div></div>
    </section>

    <section class="panel"><h2>Specs</h2>
      <div class="form-grid-4">
        <div class="field"><label for="shape">Frame shape</label><input id="shape" type="text" maxlength="40" value="${esc(p.shape || "")}" placeholder="e.g. round"></div>
        <div class="field"><label for="material">Material</label><input id="material" type="text" maxlength="60" value="${esc(p.material || "")}"></div>
        <div class="field"><label for="size">Size</label><input id="size" type="text" maxlength="40" value="${esc(p.size || "")}" placeholder="52-18-145"></div>
        <div class="field"><label for="gender">Gender</label><select id="gender">${GENDERS.map((g) => `<option value="${g}" ${g === (p.gender || "") ? "selected" : ""}>${g ? g[0].toUpperCase() + g.slice(1) : "—"}</option>`).join("")}</select></div>
      </div>
    </section>

    <section class="panel"><h2>Images</h2>
      <p class="hint">WebP, JPG or PNG. Resized to max 2000px in your browser before upload. Drag to reorder — the first image is the main one, the second shows on hover.</p>
      <ul class="sortable" id="imgs"></ul>
      <div><label class="btn btn--outline btn-sm" for="img-up" style="cursor:pointer">Add images</label><input id="img-up" type="file" multiple accept="image/webp,image/jpeg,image/png" class="sr-only"></div>
    </section>

    <section class="panel"><h2>Colour variants</h2>
      <ul class="sortable" id="vars"></ul>
      <div><button class="btn btn--outline btn-sm" type="button" id="var-add">Add colour</button></div>
    </section>

    <section class="panel"><h2>Virtual try-on</h2>
      <p class="hint">One transparent PNG of the frame, straight-on front view, with the lenses centred and the temples trimmed. Leave empty if this product can't be tried on.</p>
      <div class="preview-wrap">
        <div class="field">
          <div class="png-preview" id="png-prev"></div>
          <div class="toolbar" style="margin-top:8px">
            <label class="btn btn--outline btn-sm" for="png-up" style="cursor:pointer">Upload PNG</label><input id="png-up" type="file" accept="image/png" class="sr-only">
            <button class="btn btn--outline btn-sm" type="button" id="png-rm">Remove</button>
          </div>
          <div class="range-row"><label for="tryon_scale">Scale</label><input id="tryon_scale" type="range" min="1.2" max="3.4" step="0.01" value="${p.tryon_scale ?? 2.1}"><output id="o-scale">${Number(p.tryon_scale ?? 2.1).toFixed(2)}</output></div>
          <div class="range-row"><label for="tryon_offset_y">Vertical offset</label><input id="tryon_offset_y" type="range" min="-0.4" max="0.4" step="0.005" value="${p.tryon_offset_y ?? 0}"><output id="o-off">${Number(p.tryon_offset_y ?? 0).toFixed(3)}</output></div>
        </div>
        <div class="field">
          <span class="label">Live preview</span>
          <canvas class="preview-canvas" id="prev-canvas" width="800" height="600" aria-label="Try-on preview on a sample face"></canvas>
          <label class="btn btn--outline btn-sm" for="face-up" style="cursor:pointer;justify-self:start">Choose a sample face photo</label>
          <input id="face-up" type="file" accept="image/*" class="sr-only">
          <span class="hint" id="prev-hint">Pick any clear front-facing photo. It stays in your browser and is not uploaded.</span>
        </div>
      </div>
    </section>

    <section class="panel"><h2>Visibility</h2>
      <div class="toolbar">
        <label class="switch"><input type="checkbox" id="is_active" ${p.is_active ? "checked" : ""}> Active (visible on site)</label>
        <label class="switch"><input type="checkbox" id="is_featured" ${p.is_featured ? "checked" : ""}> Featured</label>
        <div class="field" style="width:140px"><label for="sort_order">Sort order</label><input id="sort_order" type="number" step="1" value="${p.sort_order ?? 0}"></div>
      </div>
    </section>

    <p class="error" id="form-error" role="alert" hidden></p>
    <div class="form-actions">
      <button class="btn btn--solid" type="submit">Save product</button>
      <a class="btn btn--outline" href="#products">Cancel</a>
      ${!isNew ? `<a class="btn btn--outline" href="/${esc(cats.find((c) => c.id === p.category_id)?.slug || "frames")}/${esc(p.slug)}" target="_blank" rel="noopener">View on site</a>
      <button class="btn btn--outline" type="button" id="del">Delete</button>` : ""}
    </div>
  </form>`;

  const f = main.querySelector("#pf");
  const $ = (s) => main.querySelector(s);

  // name → slug (until the slug is edited by hand)
  $("#name").addEventListener("input", () => { if (!slugTouched) $("#slug").value = slugify($("#name").value); });
  $("#slug").addEventListener("input", () => { slugTouched = true; $("#slug").value = $("#slug").value.toLowerCase().replace(/[^a-z0-9-]/g, "-"); });

  // collections filtered by category
  const paintCols = () => {
    const cid = $("#category_id").value;
    const these = cols.filter((c) => c.category_id === cid);
    $("#cols").innerHTML = these.length ? these.map((c) => `<label><input type="checkbox" value="${c.id}" ${selectedCols.has(c.id) ? "checked" : ""}> ${esc(c.name)}</label>`).join("") : `<span class="hint">No collections for this category yet.</span>`;
  };
  paintCols();
  $("#category_id").addEventListener("change", paintCols);
  $("#cols").addEventListener("change", (e) => { const c = e.target; c.checked ? selectedCols.add(c.value) : selectedCols.delete(c.value); });

  /* ---- images ---- */
  const paintImgs = () => {
    $("#imgs").innerHTML = p.images.map((im, i) => `<li data-id="${i}">${handleHTML("image " + (i + 1))}
      <div class="thumb"><img src="${esc(im.url)}" alt=""></div>
      <div class="grow"><label class="hint" for="alt-${i}">Alt text ${i === 0 ? "(main image)" : ""}</label><input class="input" id="alt-${i}" data-alt="${i}" value="${esc(im.alt || "")}" maxlength="200"></div>
      <button class="btn btn--outline btn-sm" type="button" data-rm-img="${i}">Remove</button></li>`).join("") || `<li class="hint" style="border-style:dashed">No images yet.</li>`;
  };
  paintImgs();
  sortable($("#imgs"), (order) => { p.images = order.map((i) => p.images[+i]); paintImgs(); });
  $("#imgs").addEventListener("input", (e) => { if (e.target.dataset.alt != null) p.images[+e.target.dataset.alt].alt = e.target.value; });
  $("#imgs").addEventListener("click", (e) => { const b = e.target.closest("[data-rm-img]"); if (b) { p.images.splice(+b.dataset.rmImg, 1); paintImgs(); } });
  $("#img-up").addEventListener("change", async (e) => {
    const files = [...e.target.files]; e.target.value = "";
    for (const file of files) {
      try {
        const url = await uploadImage("products", `products/${p.id}`, file);
        if (url) { p.images.push({ url, alt: $("#name").value ? `${$("#brand").value} ${$("#name").value}`.trim() : "" }); paintImgs(); }
      } catch (err) { fail(err, "Upload failed"); }
    }
  });

  /* ---- variants ---- */
  const paintVars = () => {
    $("#vars").innerHTML = p.variants.map((v, i) => `<li data-id="${i}">${handleHTML("colour " + (i + 1))}
      <div class="thumb">${v.image_url ? `<img src="${esc(v.image_url)}" alt="">` : ""}</div>
      <div class="grow"><label class="hint" for="vn-${i}">Colour name</label><input class="input" id="vn-${i}" data-vname="${i}" value="${esc(v.name || "")}" maxlength="60"></div>
      <label class="btn btn--outline btn-sm" style="cursor:pointer">Image<input type="file" accept="image/webp,image/jpeg,image/png" data-vimg="${i}" class="sr-only"></label>
      <button class="btn btn--outline btn-sm" type="button" data-rm-var="${i}">Remove</button></li>`).join("") || `<li class="hint" style="border-style:dashed">No colour variants.</li>`;
  };
  paintVars();
  sortable($("#vars"), (order) => { p.variants = order.map((i) => p.variants[+i]); paintVars(); });
  $("#var-add").addEventListener("click", () => { p.variants.push({ name: "", image_url: "" }); paintVars(); main.querySelector(`#vn-${p.variants.length - 1}`)?.focus(); });
  $("#vars").addEventListener("input", (e) => { if (e.target.dataset.vname != null) p.variants[+e.target.dataset.vname].name = e.target.value; });
  $("#vars").addEventListener("click", (e) => { const b = e.target.closest("[data-rm-var]"); if (b) { p.variants.splice(+b.dataset.rmVar, 1); paintVars(); } });
  $("#vars").addEventListener("change", async (e) => {
    const inp = e.target.closest("[data-vimg]"); if (!inp) return;
    const file = inp.files[0]; if (!file) return;
    try { const url = await uploadImage("products", `products/${p.id}/variants`, file); if (url) { p.variants[+inp.dataset.vimg].image_url = url; paintVars(); } }
    catch (err) { fail(err, "Upload failed"); }
  });

  /* ---- try-on ---- */
  let face = null, faceLm = null, pngImg = null, engine = null;
  const paintPng = async () => {
    $("#png-prev").innerHTML = p.tryon_png ? `<img src="${esc(p.tryon_png)}" alt="Try-on PNG" crossorigin="anonymous">` : "No try-on PNG";
    $("#png-rm").hidden = !p.tryon_png;
    pngImg = null;
    if (p.tryon_png && engine) { try { pngImg = await engine.loadImage(p.tryon_png); } catch {} }
    drawPreview();
  };
  const drawPreview = () => {
    const c = $("#prev-canvas"), ctx = c.getContext("2d");
    if (!face) { ctx.fillStyle = "#333333"; ctx.fillRect(0, 0, c.width, c.height); return; }
    const k = Math.min(1, 1200 / Math.max(face.naturalWidth, face.naturalHeight));
    c.width = Math.round(face.naturalWidth * k); c.height = Math.round(face.naturalHeight * k);
    ctx.drawImage(face, 0, 0, c.width, c.height);
    if (faceLm && pngImg) engine.drawFrame(ctx, pngImg, engine.placement(faceLm, c.width, c.height, { tryon_scale: +$("#tryon_scale").value, tryon_offset_y: +$("#tryon_offset_y").value }, false));
  };
  const ensureEngine = async () => { engine ??= await import("../lib/tryon.js"); return engine; };
  $("#png-up").addEventListener("change", async (e) => {
    const file = e.target.files[0]; e.target.value = ""; if (!file) return;
    try { const url = await uploadImage("products", `products/${p.id}/tryon`, file, { pngOnly: true }); if (url) { p.tryon_png = url; await ensureEngine(); paintPng(); } }
    catch (err) { fail(err, "Upload failed"); }
  });
  $("#png-rm").addEventListener("click", () => { p.tryon_png = null; paintPng(); });
  $("#tryon_scale").addEventListener("input", (e) => { $("#o-scale").textContent = (+e.target.value).toFixed(2); drawPreview(); });
  $("#tryon_offset_y").addEventListener("input", (e) => { $("#o-off").textContent = (+e.target.value).toFixed(3); drawPreview(); });
  $("#face-up").addEventListener("change", async (e) => {
    const file = e.target.files[0]; e.target.value = ""; if (!file) return;
    $("#prev-hint").textContent = "Finding the face…";
    try {
      await ensureEngine();
      face = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
      faceLm = await engine.detectStill(face);
      $("#prev-hint").textContent = faceLm ? "Adjust scale and offset until the frame sits naturally." : "No face found — try a clearer, front-facing photo.";
      if (p.tryon_png && !pngImg) { try { pngImg = await engine.loadImage(p.tryon_png); } catch {} }
      drawPreview();
    } catch (err) { $("#prev-hint").textContent = "The preview model could not load. Check your connection."; console.error(err); }
  });
  paintPng(); drawPreview();

  /* ---- delete ---- */
  $("#del")?.addEventListener("click", async () => {
    if (!(await confirmDialog(`Delete “${p.name}”?`))) return;
    const { error } = await sb.from("products").delete().eq("id", p.id);
    if (error) return fail(error, "Delete failed");
    toast("Product deleted"); location.hash = "products";
  });

  /* ---- save ---- */
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#form-error");
    const v = (s) => $(s).value.trim();
    const miss = [["#name", "Name"], ["#slug", "Slug"], ["#brand", "Brand"], ["#price", "Price"]].filter(([s]) => !v(s));
    if (miss.length) { err.hidden = false; err.textContent = `Please fill in: ${miss.map((m) => m[1]).join(", ")}.`; $(miss[0][0]).focus(); return; }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v("#slug"))) { err.hidden = false; err.textContent = "Slug can only use lowercase letters, numbers and single dashes."; $("#slug").focus(); return; }
    err.hidden = true;
    const btn = f.querySelector('[type="submit"]'); btn.disabled = true; btn.textContent = "Saving…";
    const row = {
      id: p.id, name: v("#name"), slug: v("#slug"), brand: v("#brand"), category_id: $("#category_id").value,
      price: Number(v("#price")), compare_at_price: v("#compare_at_price") ? Number(v("#compare_at_price")) : null,
      description: v("#description") || null, shape: v("#shape").toLowerCase() || null, material: v("#material") || null, size: v("#size") || null,
      gender: $("#gender").value || null, images: p.images.filter((i) => i.url), variants: p.variants.filter((x) => x.name),
      tryon_png: p.tryon_png || null, tryon_scale: Number($("#tryon_scale").value), tryon_offset_y: Number($("#tryon_offset_y").value),
      is_active: $("#is_active").checked, is_featured: $("#is_featured").checked, sort_order: parseInt(v("#sort_order") || "0", 10),
    };
    const { error } = await sb.from("products").upsert(row, { onConflict: "id" });
    if (error) {
      btn.disabled = false; btn.textContent = "Save product";
      err.hidden = false; err.textContent = error.code === "23505" ? "That slug is already used by another product." : error.message;
      return;
    }
    const valid = [...selectedCols].filter((cid) => cols.some((c) => c.id === cid && c.category_id === row.category_id));
    const d = await sb.from("product_collections").delete().eq("product_id", row.id);
    if (!d.error && valid.length) await sb.from("product_collections").insert(valid.map((collection_id) => ({ product_id: row.id, collection_id })));
    btn.disabled = false; btn.textContent = "Save product";
    toast("Product saved");
    if (isNew) location.hash = `products/edit/${row.id}`;
  });
}

/* ================================ CSV ================================ */
const CSV_HEAD = ["name", "slug", "brand", "category", "collections", "price", "compare_at_price", "description", "shape", "material", "size", "gender", "is_active", "is_featured", "sort_order"];

function csvTemplate() {
  const example = ["Example Frame 01", "example-frame-01", "Ray-Ban", "frames", "classic|titanium-light", "4500", "5200", "Short description", "round", "Acetate", "52-18-145", "unisex", "true", "false", "10"];
  download("lahore-optical-products-template.csv", CSV_HEAD.join(",") + "\n" + example.map(csvCell).join(",") + "\n", "text/csv");
}

async function importCSV(file, main) {
  let rows;
  try { rows = parseCSV(await file.text()); } catch (e) { return fail(e, "Could not read CSV"); }
  if (!rows.length) return toast("The CSV has no rows.", "error");
  const bool = (s, d) => (s === "" || s == null ? d : /^(1|true|yes|y)$/i.test(s));
  const errors = [], out = [], links = [];
  rows.forEach((r, i) => {
    const line = i + 2;
    const cat = cats.find((c) => c.slug === (r.category || "").toLowerCase() || c.name.toLowerCase() === (r.category || "").toLowerCase());
    if (!r.name || !r.brand || !r.price || !cat) { errors.push(`Row ${line}: needs name, brand, price and a valid category`); return; }
    const gender = (r.gender || "").toLowerCase();
    const row = {
      name: r.name, slug: r.slug ? slugify(r.slug) : slugify(`${r.brand} ${r.name}`), brand: r.brand, category_id: cat.id,
      price: Number(r.price.replace(/[^\d.]/g, "")), compare_at_price: r.compare_at_price ? Number(r.compare_at_price.replace(/[^\d.]/g, "")) : null,
      description: r.description || null, shape: (r.shape || "").toLowerCase() || null, material: r.material || null, size: r.size || null,
      gender: ["men", "women", "unisex", "kids"].includes(gender) ? gender : null,
      is_active: bool(r.is_active, true), is_featured: bool(r.is_featured, false), sort_order: parseInt(r.sort_order || "0", 10) || 0,
    };
    if (Number.isNaN(row.price)) { errors.push(`Row ${line}: price is not a number`); return; }
    out.push(row);
    links.push({ slug: row.slug, cols: (r.collections || "").split("|").map((s) => s.trim().toLowerCase()).filter(Boolean), category_id: cat.id });
  });
  if (!out.length) return toast(errors.slice(0, 3).join(" · ") || "Nothing to import", "error");
  const sb = state.sb;
  let imported = 0;
  for (let i = 0; i < out.length; i += 100) {
    const chunk = out.slice(i, i + 100);
    const { data, error } = await sb.from("products").upsert(chunk, { onConflict: "slug" }).select("id,slug");
    if (error) { errors.push(`Rows ${i + 2}–${i + chunk.length + 1}: ${error.message}`); continue; }
    imported += data.length;
    const pcs = [];
    for (const d of data) {
      const l = links.find((x) => x.slug === d.slug);
      for (const cs of l?.cols || []) { const c = cols.find((k) => k.slug === cs && k.category_id === l.category_id); if (c) pcs.push({ product_id: d.id, collection_id: c.id }); }
    }
    if (pcs.length) await sb.from("product_collections").upsert(pcs, { onConflict: "product_id,collection_id", ignoreDuplicates: true });
  }
  toast(`Imported ${imported} product${imported === 1 ? "" : "s"}. Add images by editing each product.`);
  if (errors.length) toast(`${errors.length} row(s) skipped: ${errors.slice(0, 3).join(" · ")}`, "error");
  fetchRows(main);
}

/* ================================ SITEMAP ================================ */
async function sitemap() {
  const sb = state.sb;
  const { data, error } = await sb.from("products").select("slug,category_id,updated_at").eq("is_active", true).limit(5000);
  if (error) return fail(error, "Sitemap failed");
  const origin = siteOrigin();
  const url = (loc, lastmod, pr) => `  <url><loc>${origin}${loc}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ""}${pr ? `<priority>${pr}</priority>` : ""}</url>`;
  const lines = [url("/", null, "1.0"), url("/try-on", null, "0.7"), ...cats.map((c) => url(`/${c.slug}`, null, "0.9")),
    ...cols.map((c) => url(`/collections/${c.slug}`, null, "0.6")),
    ...data.map((p) => url(`/${cats.find((c) => c.id === p.category_id)?.slug || "frames"}/${p.slug}`, p.updated_at, "0.8")),
    url("/privacy"), url("/terms")];
  download("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${lines.join("\n")}\n</urlset>\n`, "application/xml");
  toast("sitemap.xml downloaded — replace the file in the site folder and redeploy.");
}
