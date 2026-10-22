import { state, esc, toast, fail, confirmDialog, uploadImage, pathFromPublicUrl } from "./kit.js";
import { SITE_DEFAULTS } from "../lib/data.js";

const LABELS = {
  logo: "Logo (160×48, PNG/WebP)", hero_image: "Hero image (4:5)", hero_h1: "Hero heading", hero_subline: "Hero subline",
  tryon_band_media: "Try-on band media (16:9, image or MP4/WebM video)", eyecare_image: "Eye-care image (4:3)",
  visit_image: "Visit image — Gate 3 photo (4:3)", legacy_image: "Legacy image — 1936 photo (16:9)",
  review_quote_1: "Review quote 1", review_author_1: "Review 1 — name", review_quote_2: "Review quote 2", review_author_2: "Review 2 — name",
  review_quote_3: "Review quote 3", review_author_3: "Review 3 — name",
  opening_hours: "Opening hours", email: "Email", instagram_url: "Instagram URL", facebook_url: "Facebook URL", youtube_url: "YouTube URL",
  google_reviews_url: "Google reviews URL", maps_url: "Google Maps URL (directions)",
};
const GROUPS = [
  ["Images", ["logo", "hero_image", "tryon_band_media", "eyecare_image", "visit_image", "legacy_image"]],
  ["Hero text", ["hero_h1", "hero_subline"]],
  ["Review quotes", ["review_quote_1", "review_author_1", "review_quote_2", "review_author_2", "review_quote_3", "review_author_3"]],
  ["Contact & links", ["opening_hours", "email", "instagram_url", "facebook_url", "youtube_url", "google_reviews_url", "maps_url"]],
];

let values = {};

export async function render(main) {
  const { data, error } = await state.sb.from("site_content").select("key,value,type");
  if (error) throw error;
  values = Object.fromEntries(Object.keys(SITE_DEFAULTS).map((k) => [k, SITE_DEFAULTS[k].value]));
  for (const r of data) values[r.key] = r.value ?? "";

  main.innerHTML = `<h1>Site content</h1>
    <p class="hint" style="margin-bottom:16px">Images upload to the public “site” bucket. “Reset” restores the original placeholder or default text.</p>
    ${GROUPS.map(([g, keys]) => `<h2>${g}</h2><div class="content-list">${keys.map(item).join("")}</div>`).join("")}`;

  main.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const key = b.closest("[data-key]").dataset.key, wrap = b.closest("[data-key]");
    if (b.dataset.act === "save") {
      const v = wrap.querySelector("[data-val]").value.trim();
      if (SITE_DEFAULTS[key].type === "url" && v && !/^https?:\/\//.test(v)) return toast("Links must start with https://", "error");
      await save(key, v, wrap);
    }
    if (b.dataset.act === "reset") {
      if (!(await confirmDialog(`Reset “${LABELS[key]}” to its default?`, "Reset"))) return;
      const old = values[key];
      await save(key, SITE_DEFAULTS[key].value, wrap);
      const p = pathFromPublicUrl("site", old); if (p) state.sb.storage.from("site").remove([p]);
    }
  });
  main.addEventListener("change", async (e) => {
    const inp = e.target.closest("[data-upload]"); if (!inp) return;
    const file = inp.files[0]; inp.value = ""; if (!file) return;
    const key = inp.dataset.upload, wrap = inp.closest("[data-key]");
    try {
      const url = await uploadImage("site", key, file, { allowVideo: key === "tryon_band_media", keepPng: key === "logo" });
      if (!url) return;
      const old = values[key];
      await save(key, url, wrap);
      const p = pathFromPublicUrl("site", old); if (p && old !== url) state.sb.storage.from("site").remove([p]);
    } catch (err) { fail(err, "Upload failed"); }
  });
}

async function save(key, value, wrap) {
  const { error } = await state.sb.from("site_content").upsert({ key, value, type: SITE_DEFAULTS[key].type }, { onConflict: "key" });
  if (error) return fail(error, "Not saved");
  values[key] = value;
  wrap.outerHTML = item(key);
  toast("Saved");
}

function item(key) {
  const t = SITE_DEFAULTS[key].type, v = values[key] ?? "";
  if (t === "image") {
    const isVid = /\.(mp4|webm)(\?|$)/i.test(v);
    const accept = key === "tryon_band_media" ? "image/webp,image/jpeg,image/png,video/mp4,video/webm" : "image/webp,image/jpeg,image/png";
    return `<div class="content-item" data-key="${key}">
      <div><span class="key">${esc(LABELS[key])}</span><p class="hint">${v ? "Custom image" : "Placeholder"}</p></div>
      <div class="thumb">${v ? (isVid ? `<video src="${esc(v)}" muted playsinline></video>` : `<img src="${esc(v)}" alt="">`) : ""}</div>
      <div class="toolbar" style="margin:0">
        <label class="btn btn--outline btn-sm" style="cursor:pointer">${v ? "Replace" : "Upload"}<input type="file" class="sr-only" accept="${accept}" data-upload="${key}"></label>
        ${v ? `<button class="btn btn--outline btn-sm" type="button" data-act="reset">Reset</button>` : ""}
      </div></div>`;
  }
  const long = /quote|subline/.test(key);
  const input = long ? `<textarea class="input" data-val rows="3" maxlength="400" aria-label="${esc(LABELS[key])}">${esc(v)}</textarea>`
    : `<input class="input" data-val type="${t === "url" ? "url" : "text"}" value="${esc(v)}" maxlength="300" aria-label="${esc(LABELS[key])}" ${t === "url" ? 'placeholder="https://…"' : ""}>`;
  return `<div class="content-item" data-key="${key}">
    <span class="key">${esc(LABELS[key])}</span>
    ${input}
    <div class="toolbar" style="margin:0">
      <button class="btn btn--solid btn-sm" type="button" data-act="save">Save</button>
      <button class="btn btn--outline btn-sm" type="button" data-act="reset">Reset</button>
    </div></div>`;
}
