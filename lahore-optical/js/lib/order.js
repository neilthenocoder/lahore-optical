// "Order on WhatsApp" sheet: prescription question → name/delivery → inquiry
// row + private prescription upload → WhatsApp with a pre-filled message.
// No payment happens here: the shop confirms the order on WhatsApp.
import { $, $$, esc, formatPrice, waLink, icon, openDialog, makeRef, uuid, slotHTML, toast, siteOrigin } from "./util.js";
import { createInquiry, uploadPrescription } from "./data.js";
import { productUrl } from "./card.js";

const MAX = 8 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "application/pdf"];
let dlg, current;

function build() {
  dlg = document.createElement("dialog");
  dlg.className = "sheet";
  dlg.id = "order-sheet";
  dlg.setAttribute("aria-labelledby", "order-title");
  dlg.innerHTML = `
  <form novalidate>
    <div class="sheet__head">
      <div class="stack">
        <span class="steps-indicator" id="order-step">Step 1 of 2</span>
        <h2 class="h3" id="order-title">Do you have a prescription?</h2>
      </div>
      <button class="icon-btn" type="button" data-close aria-label="Close">${icon("close")}</button>
    </div>
    <div class="sheet__body">
      <div class="sheet__product" id="order-product"></div>

      <fieldset class="options" data-step="1">
        <legend class="sr-only">Do you have a prescription?</legend>
        <label class="option"><input type="radio" name="rx" value="upload"><span class="option__dot"></span>
          <span>Yes — upload it</span></label>
        <div class="file-drop" id="rx-upload" hidden>
          <label class="label" for="rx-file">Prescription (JPG, PNG or PDF, max 8 MB)</label>
          <input id="rx-file" name="file" type="file" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" aria-describedby="rx-note rx-error">
          <p class="note" id="rx-note">Your prescription is stored privately and only seen by our opticians.</p>
          <p class="error" id="rx-error" hidden role="alert"></p>
        </div>
        <label class="option"><input type="radio" name="rx" value="send"><span class="option__dot"></span>
          <span>I'll send it on WhatsApp</span></label>
        <label class="option"><input type="radio" name="rx" value="none"><span class="option__dot"></span>
          <span>No — I want these as style / non-prescription glasses
          <span class="option__help" id="rx-none-help" hidden>Plenty of our customers wear frames for style. We'll fit clear or blue-light lenses.</span></span></label>
        <p class="error" id="rx-choose" hidden role="alert">Please choose one option.</p>
      </fieldset>

      <div data-step="2" hidden>
        <div class="field">
          <label for="o-name">Your name (optional)</label>
          <input id="o-name" name="name" type="text" autocomplete="name" maxlength="80">
        </div>
        <fieldset class="options" style="margin-top:24px">
          <legend class="label" style="margin-bottom:8px;font-size:.75rem;letter-spacing:.16em;text-transform:uppercase;font-weight:500;color:#000">Preferred delivery</legend>
          <label class="option"><input type="radio" name="delivery" value="home" checked><span class="option__dot"></span><span>Home delivery in Lucknow</span></label>
          <label class="option"><input type="radio" name="delivery" value="pickup"><span class="option__dot"></span><span>Pick up in store</span></label>
        </fieldset>
        <p class="note" style="margin-top:16px">You'll confirm the order with us on WhatsApp. Nothing is paid on this website.</p>
      </div>
    </div>
    <div class="sheet__foot">
      <button class="btn btn--outline" type="button" data-back hidden>Back</button>
      <button class="btn btn--solid" type="submit" id="order-next">Continue</button>
    </div>
  </form>`;
  document.body.append(dlg);

  const form = $("form", dlg);
  $("[data-close]", dlg).addEventListener("click", () => dlg.close());
  form.addEventListener("change", (e) => {
    if (e.target.name === "rx") {
      $("#rx-upload", dlg).hidden = e.target.value !== "upload";
      $("#rx-none-help", dlg).hidden = e.target.value !== "none";
      $("#rx-choose", dlg).hidden = true;
      if (e.target.value === "upload") $("#rx-file", dlg).focus();
    }
    if (e.target.name === "file") validateFile();
  });
  $("[data-back]", dlg).addEventListener("click", () => step(1));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (dlg.dataset.step === "1") {
      const rx = form.rx.value;
      if (!rx) { $("#rx-choose", dlg).hidden = false; $('input[name="rx"]', dlg).focus(); return; }
      if (rx === "upload" && !validateFile(true)) return;
      step(2);
    } else submit(form);
  });
}

function validateFile(required) {
  const input = $("#rx-file", dlg), err = $("#rx-error", dlg), f = input.files[0];
  let msg = "";
  if (!f && required) msg = "Choose a file, or pick “I'll send it on WhatsApp”.";
  else if (f && !TYPES.includes(f.type)) msg = "Please choose a JPG, PNG or PDF file.";
  else if (f && f.size > MAX) msg = "That file is larger than 8 MB. Try a smaller photo, or send it on WhatsApp.";
  err.textContent = msg; err.hidden = !msg;
  input.setAttribute("aria-invalid", msg ? "true" : "false");
  if (msg) input.focus();
  return !msg;
}

function step(n) {
  dlg.dataset.step = String(n);
  $$("[data-step]", dlg).forEach((el) => (el.hidden = el.dataset.step !== String(n)));
  $("#order-step", dlg).textContent = `Step ${n} of 2`;
  $("#order-title", dlg).textContent = n === 1 ? "Do you have a prescription?" : "Almost done";
  $("[data-back]", dlg).hidden = n === 1;
  $("#order-next", dlg).innerHTML = n === 1 ? "Continue" : `${icon("whatsapp")}Continue to WhatsApp`;
  (n === 1 ? $('input[name="rx"]:checked', dlg) || $('input[name="rx"]', dlg) : $("#o-name", dlg)).focus();
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);

async function submit(form) {
  const btn = $("#order-next", dlg);
  btn.disabled = true; btn.textContent = "Opening WhatsApp…";
  const p = current.product;
  const rx = form.rx.value;
  const file = rx === "upload" ? $("#rx-file", dlg).files[0] : null;
  const delivery = form.delivery.value || "home";
  const name = form.name.value.trim().slice(0, 80);
  const url = siteOrigin() + productUrl(p);

  // Open the tab synchronously so pop-up blockers allow it; fill it in after saving.
  const isMobile = matchMedia("(max-width: 809px)").matches;
  const win = isMobile ? null : window.open("", "_blank");
  if (win) { try { win.opener = null; win.document.title = "Opening WhatsApp…"; win.document.body.textContent = "Opening WhatsApp…"; } catch {} }

  let ref = makeRef(), rxStatus = rx === "upload" ? "uploaded" : rx === "send" ? "will_send" : "not_needed", path = null;
  try {
    if (file) {
      const ext = ({ "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" })[file.type] || "bin";
      path = `inquiries/${ref}/${uuid()}.${ext}`;
      try { await withTimeout(uploadPrescription(path, file), 20000); }
      catch (e) { console.warn("upload failed", e); path = null; rxStatus = "will_send"; }
    }
    const row = () => ({
      ref, product_id: /^[0-9a-f-]{36}$/i.test(p.id) ? p.id : null,
      product_snapshot: { name: p.name, brand: p.brand, price: Number(p.price), colour: current.colour || null, slug: p.slug, url },
      prescription_status: rxStatus, prescription_path: path, customer_name: name || null, delivery,
    });
    try { await withTimeout(createInquiry(row()), 10000); }
    catch (e) {
      if (e?.code === "23505" && !path) { ref = makeRef(); await withTimeout(createInquiry(row()), 10000); } // ref collision
      else throw e;
    }
  } catch (e) {
    // Never block the enquiry: fall back to "will send here" and still open WhatsApp.
    console.warn("inquiry failed — continuing to WhatsApp", e);
    if (rxStatus === "uploaded") rxStatus = "will_send";
  }

  // Never include a link to the prescription file in the message.
  const rxText = { uploaded: "uploaded", will_send: "will send here", not_needed: "not needed (style glasses)" }[rxStatus];
  const colour = current.colour ? ` (${current.colour})` : "";
  const msg = [
    `Hi Lahore Optical, I'd like to order ${p.brand} ${p.name}${colour} — ${formatPrice(p.price)}.`,
    `Ref: ${ref}`,
    `Prescription: ${rxText}`,
    `Delivery: ${delivery === "pickup" ? "store pickup" : "home delivery"}`,
    url,
  ].join("\n");
  const link = waLink(msg);
  if (win && !win.closed) win.location.href = link; else location.href = link;

  dlg.close();
  toast(`Your reference is ${ref}. Send the message in WhatsApp to confirm.`, 6000);
  btn.disabled = false;
}

/** Opens the order sheet for a product. */
export function openOrder(product, { colour = "" } = {}) {
  if (!dlg) build();
  current = { product, colour };
  const form = $("form", dlg);
  form.reset();
  $("#rx-upload", dlg).hidden = true; $("#rx-none-help", dlg).hidden = true;
  $("#rx-error", dlg).hidden = true; $("#rx-choose", dlg).hidden = true;
  const img = product.images?.[0];
  $("#order-product", dlg).innerHTML = `${slotHTML({ label: "", ar: "1 / 1", url: img?.url, alt: "" })}
    <div><span class="eyebrow">${esc(product.brand)}</span><p class="h3" style="font-size:1.125rem;margin-top:4px">${esc(product.name)}</p>
    <p class="small" style="margin-top:4px">${colour ? esc(colour) + " · " : ""}${formatPrice(product.price)}</p></div>`;
  openDialog(dlg);
  step(1);
}
