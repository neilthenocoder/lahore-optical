// ---------------------------------------------------------------------------
// Shared virtual try-on engine.
// Google MediaPipe Face Landmarker (@mediapipe/tasks-vision), loaded from the
// CDN only when try-on opens. Runs entirely on the device: nothing recorded,
// nothing uploaded.
//
// Placement per frame:
//   eye centres = midpoint of outer + inner corner landmarks (33/133, 263/362)
//   width       = inter-ocular distance × product.tryon_scale (default 2.1)
//   rotation    = roll angle between the eyes
//   position    = nose-bridge landmark (168) + tryon_offset_y × width (downwards)
//   smoothing   = lerp 0.35
// ---------------------------------------------------------------------------
import { $, esc, formatPrice, icon, slotHTML, openDialog } from "./util.js";

const VISION_VER = "0.10.14";
const VISION_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VER}/vision_bundle.mjs`;
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VER}/wasm`;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const LM = { leftOuter: 33, leftInner: 133, rightOuter: 263, rightInner: 362, bridge: 168 };
const LERP = 0.35;

let visionPromise;
const landmarkers = {};

function loadVision() {
  visionPromise ??= import(VISION_URL).then(async (mod) => {
    const fileset = await mod.FilesetResolver.forVisionTasks(WASM_URL);
    return { mod, fileset };
  }).catch((e) => { visionPromise = null; throw e; });
  return visionPromise;
}

/** @param {"VIDEO"|"IMAGE"} mode */
export async function getLandmarker(mode = "VIDEO") {
  if (landmarkers[mode]) return landmarkers[mode];
  const { mod, fileset } = await loadVision();
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: mode, numFaces: 1,
    outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
  });
  let lm;
  try { lm = await mod.FaceLandmarker.createFromOptions(fileset, opts("GPU")); }
  catch { lm = await mod.FaceLandmarker.createFromOptions(fileset, opts("CPU")); }
  landmarkers[mode] = lm;
  return lm;
}

const imgCache = new Map();
export function loadImage(url) {
  if (!url) return Promise.resolve(null);
  if (!imgCache.has(url)) {
    imgCache.set(url, new Promise((res, rej) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => res(im);
      im.onerror = () => { imgCache.delete(url); rej(new Error("image load failed")); };
      im.src = url;
    }));
  }
  return imgCache.get(url);
}

/** Target placement in canvas pixels. */
export function placement(lm, W, H, product, mirrored) {
  const P = (i) => ({ x: (mirrored ? 1 - lm[i].x : lm[i].x) * W, y: lm[i].y * H });
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  let a = mid(P(LM.leftOuter), P(LM.leftInner));
  let b = mid(P(LM.rightOuter), P(LM.rightInner));
  if (b.x < a.x) [a, b] = [b, a];
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const scale = Number(product?.tryon_scale) || 2.1;
  const offY = Number(product?.tryon_offset_y) || 0;
  const w = dist * scale;
  const br = P(LM.bridge);
  // offset is along the face's "down" direction, proportional to frame width
  return { x: br.x - Math.sin(angle) * offY * w, y: br.y + Math.cos(angle) * offY * w, w, angle };
}

export function drawFrame(ctx, img, s) {
  if (!img || !s) return;
  const h = s.w * (img.naturalHeight / img.naturalWidth);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.angle);
  ctx.drawImage(img, -s.w / 2, -h / 2, s.w, h);
  ctx.restore();
}

/** One-shot detection on a still image (selfie fallback, admin preview). */
export async function detectStill(source) {
  const lm = await getLandmarker("IMAGE");
  const r = lm.detect(source);
  return r.faceLandmarks?.[0] || null;
}

// ---------------------------------------------------------------------------
// UI component
// ---------------------------------------------------------------------------
export class TryOn {
  /**
   * @param {HTMLElement} host
   * @param {{products?: any[], product?: any, picker?: boolean, onClose?: Function, onSelect?: Function, onOrder?: Function}} o
   */
  constructor(host, o = {}) {
    this.host = host; this.o = o;
    this.products = o.products || (o.product ? [o.product] : []);
    this.product = o.product || this.products[0] || null;
    this.facing = "user"; this.stream = null; this.running = false; this.mode = "idle";
    this.s = null; this.lost = 0; this.still = null; this.stillLm = null;
    this.render();
    if (this.product) this.setProduct(this.product, { silent: true });
  }

  render() {
    const closeBtn = this.o.onClose ? `<div class="tryon__topbar"><button class="icon-btn" type="button" data-act="close" aria-label="Close try-on">${icon("close")}</button></div>` : "";
    this.host.innerHTML = `<div class="tryon" role="region" aria-label="Virtual try-on">
      ${closeBtn}
      <div class="tryon__stage">
        <video playsinline muted></video>
        <canvas aria-label="Camera preview with the selected frame" role="img"></canvas>
        <span class="tryon__status" hidden aria-live="polite"></span>
        <div class="tryon__panel" data-panel></div>
      </div>
      <div class="tryon__bar">
        <p class="tryon__current" aria-live="polite"></p>
        <div class="group">
          <button class="btn btn--outline on-dark" type="button" data-act="capture" disabled>${icon("camera")}Capture photo</button>
          <button class="btn btn--outline on-dark" type="button" data-act="switch" hidden>Switch camera</button>
          ${this.o.onOrder ? `<button class="btn btn--solid on-dark" type="button" data-act="order">Order on WhatsApp</button>` : ""}
        </div>
      </div>
      ${this.o.picker && this.products.length > 1 ? `<div class="tryon__picker" role="group" aria-label="Choose a frame"></div>` : ""}
      <input type="file" accept="image/*" data-selfie hidden>
    </div>`;
    this.el = $(".tryon", this.host);
    this.video = $("video", this.el);
    this.canvas = $("canvas", this.el);
    this.ctx = this.canvas.getContext("2d");
    this.panel = $("[data-panel]", this.el);
    this.status = $(".tryon__status", this.el);
    this.selfieInput = $("[data-selfie]", this.el);
    this.el.addEventListener("click", (e) => this.onClick(e));
    this.selfieInput.addEventListener("change", () => this.onSelfie());
    this.renderPicker();
    this.prePrompt();
  }

  renderPicker() {
    const pk = $(".tryon__picker", this.el);
    if (!pk) return;
    pk.innerHTML = this.products.map((p) => `<button class="tryon__pick" type="button" data-pick="${esc(p.id)}" aria-pressed="${p.id === this.product?.id}">
        ${slotHTML({ label: "Frame", ar: "1 / 1", url: p.images?.[0]?.url, alt: "" })}<span class="t">${esc(p.brand)}<br>${esc(p.name)}</span></button>`).join("");
  }

  onClick(e) {
    const b = e.target.closest("[data-act],[data-pick]");
    if (!b) return;
    if (b.dataset.pick) { const p = this.products.find((x) => String(x.id) === b.dataset.pick); if (p) this.setProduct(p); return; }
    const a = b.dataset.act;
    if (a === "start") this.start();
    else if (a === "selfie") this.selfieInput.click();
    else if (a === "retry") this.start();
    else if (a === "capture") this.capture();
    else if (a === "switch") this.switchCamera();
    else if (a === "order") this.o.onOrder?.(this.product);
    else if (a === "close") this.o.onClose?.();
  }

  panelHTML(html) { this.panel.hidden = false; this.panel.innerHTML = `<div class="stack">${html}</div>`; }
  hidePanel() { this.panel.hidden = true; this.panel.innerHTML = ""; }

  prePrompt() {
    this.panelHTML(`
      <span class="eyebrow">Live try-on</span>
      <p class="h3">Allow camera to try frames on your face.</p>
      <ul>
        <li>Works best in bright, even light — face a window or lamp, not a light behind you.</li>
        <li>Nothing is recorded or uploaded. It all happens on your device.</li>
      </ul>
      <div class="actions" style="justify-content:center">
        <button class="btn btn--solid on-dark" type="button" data-act="start">${icon("camera")}Start camera</button>
        <button class="link" type="button" data-act="selfie">Upload a selfie instead</button>
      </div>`);
  }

  error(kind) {
    const selfie = `<button class="btn btn--solid on-dark" type="button" data-act="selfie">Upload a selfie instead</button>`;
    const msgs = {
      insecure: `<p class="h3">The camera needs a secure (https) connection.</p><p>Open this page over https, or use a selfie instead.</p><div class="actions" style="justify-content:center">${selfie}</div>`,
      denied: `<p class="h3">Camera access is blocked.</p>
        <p>To turn it back on:</p>
        <ol><li><strong>Chrome:</strong> click the camera or lock icon in the address bar → Site settings → Camera → Allow, then reload.</li>
        <li><strong>Safari (iPhone):</strong> Settings → Safari → Camera → Allow. On Mac: Safari → Settings for This Website → Camera → Allow.</li></ol>
        <div class="actions" style="justify-content:center">${selfie}<button class="btn btn--outline on-dark" type="button" data-act="retry">Try again</button></div>`,
      nocamera: `<p class="h3">No camera found.</p><p>You can still try frames on a photo of yourself.</p><div class="actions" style="justify-content:center">${selfie}</div>`,
      busy: `<p class="h3">Your camera is being used by another app.</p><p>Close the other app and try again.</p><div class="actions" style="justify-content:center"><button class="btn btn--outline on-dark" type="button" data-act="retry">Try again</button>${selfie}</div>`,
      model: `<p class="h3">The try-on could not load.</p><p>Check your connection and try again.</p><div class="actions" style="justify-content:center"><button class="btn btn--solid on-dark" type="button" data-act="retry">Retry</button></div>`,
      noface: `<p class="h3">We couldn't find a face in that photo.</p><p>Use a clear, front-facing photo in good light.</p><div class="actions" style="justify-content:center">${selfie}<button class="btn btn--outline on-dark" type="button" data-act="start">Use camera</button></div>`,
    };
    this.panelHTML(msgs[kind] || msgs.model);
    $("button", this.panel)?.focus();
  }

  async setProduct(p, { silent } = {}) {
    this.product = p;
    this.s = null;
    $(".tryon__current", this.el).innerHTML = p ? `${esc(p.brand)} ${esc(p.name)} · ${formatPrice(p.price)}` : "";
    this.el.querySelectorAll("[data-pick]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pick === String(p.id))));
    try { this.frameImg = await loadImage(p?.tryon_png); } catch { this.frameImg = null; }
    if (this.mode === "still") this.drawStill();
    if (!silent) this.o.onSelect?.(p);
  }

  async start() {
    this.stopStream();
    if (!window.isSecureContext) return this.error("insecure");
    if (!navigator.mediaDevices?.getUserMedia) return this.error("nocamera");
    this.panelHTML(`<p class="h3">Starting camera…</p><p>Loading the try-on model. This takes a few seconds the first time.</p>`);
    const modelP = getLandmarker("VIDEO");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) {
      const n = e?.name;
      if (n === "NotAllowedError" || n === "SecurityError") return this.error("denied");
      if (n === "NotFoundError" || n === "OverconstrainedError") return this.error("nocamera");
      if (n === "NotReadableError" || n === "AbortError") return this.error("busy");
      return this.error("nocamera");
    }
    try { this.lm = await modelP; } catch (e) { console.error(e); this.stopStream(); return this.error("model"); }
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    this.mode = "live"; this.still = null;
    this.hidePanel();
    $('[data-act="capture"]', this.el).disabled = false;
    this.updateSwitch();
    this.running = true;
    this.lastTime = -1;
    this.loop();
  }

  async updateSwitch() {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      $('[data-act="switch"]', this.el).hidden = devs.filter((d) => d.kind === "videoinput").length < 2;
    } catch {}
  }

  switchCamera() { this.facing = this.facing === "user" ? "environment" : "user"; this.start(); }

  loop() {
    if (!this.running) return;
    const v = this.video;
    if (v.readyState >= 2) {
      const W = v.videoWidth, H = v.videoHeight;
      if (this.canvas.width !== W) { this.canvas.width = W; this.canvas.height = H; }
      const mirrored = this.facing === "user";
      const c = this.ctx;
      c.save();
      if (mirrored) { c.translate(W, 0); c.scale(-1, 1); }
      c.drawImage(v, 0, 0, W, H);
      c.restore();
      if (v.currentTime !== this.lastTime) {
        this.lastTime = v.currentTime;
        let res;
        try { res = this.lm.detectForVideo(v, performance.now()); } catch {}
        const face = res?.faceLandmarks?.[0];
        if (face) {
          const t = placement(face, W, H, this.product, mirrored);
          this.s = this.s ? lerpS(this.s, t) : t;
          this.lost = 0;
        } else this.lost++;
      }
      const searching = this.lost > 8;
      this.status.hidden = !searching;
      if (searching) this.status.textContent = "Looking for your face…";
      if (!searching) drawFrame(c, this.frameImg, this.s);
    }
    this.raf = requestAnimationFrame(() => this.loop());
  }

  async onSelfie() {
    const f = this.selfieInput.files[0];
    this.selfieInput.value = "";
    if (!f) return;
    this.stopStream();
    this.panelHTML(`<p class="h3">Reading your photo…</p>`);
    try {
      const url = URL.createObjectURL(f);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      let lm;
      try { lm = await detectStill(img); } catch (e) { console.error(e); return this.error("model"); }
      if (!lm) return this.error("noface");
      this.still = img; this.stillLm = lm; this.mode = "still";
      this.hidePanel();
      $('[data-act="capture"]', this.el).disabled = false;
      this.drawStill();
    } catch { this.error("noface"); }
  }

  drawStill() {
    if (!this.still) return;
    const img = this.still;
    const max = 1600, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const W = Math.round(img.naturalWidth * k), H = Math.round(img.naturalHeight * k);
    this.canvas.width = W; this.canvas.height = H;
    this.ctx.drawImage(img, 0, 0, W, H);
    this.status.hidden = true;
    drawFrame(this.ctx, this.frameImg, placement(this.stillLm, W, H, this.product, false));
  }

  capture() {
    this.canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `lahore-optical-try-on-${(this.product?.slug || "frame")}.jpg`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, "image/jpeg", 0.92);
  }

  stopStream() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
  destroy() { this.stopStream(); this.host.innerHTML = ""; }
}

function lerpS(a, b) {
  return { x: a.x + (b.x - a.x) * LERP, y: a.y + (b.y - a.y) * LERP, w: a.w + (b.w - a.w) * LERP, angle: a.angle + (b.angle - a.angle) * LERP };
}

/** Full-screen modal used on the product page, preloaded with one frame. */
export function openTryOnModal(product, { products = [product], onOrder } = {}) {
  const dlg = document.createElement("dialog");
  dlg.className = "tryon-modal";
  dlg.setAttribute("aria-label", "Virtual try-on");
  dlg.dataset.noBackdropClose = "1";
  document.body.append(dlg);
  const t = new TryOn(dlg, { products, product, picker: true, onClose: () => dlg.close(), onOrder: onOrder ? (p) => { dlg.close(); onOrder(p); } : null });
  dlg.addEventListener("close", () => { t.destroy(); dlg.remove(); });
  openDialog(dlg);
  $('[data-act="start"]', dlg)?.focus();
  return t;
}
