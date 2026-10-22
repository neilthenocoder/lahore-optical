import { state, esc, toast, fail, confirmDialog, fmtDate } from "./kit.js";
import { formatPrice } from "../lib/util.js";

const PER = 30;
const OLD_DAYS = 90;
const RX = { uploaded: "Uploaded", will_send: "Will send", not_needed: "Not needed" };
const ui = { page: 0, q: "", status: "" };

export async function render(main) {
  main.innerHTML = `<h1>Inquiries</h1>
    <p class="hint" style="margin-bottom:16px">WhatsApp order enquiries. Match the reference in the customer's WhatsApp message (e.g. LO-7F3K2). Prescriptions open through a link that expires after 60 seconds.</p>
    <div class="toolbar">
      <input class="input grow" type="search" id="q" placeholder="Search by reference, e.g. LO-7F3K2" aria-label="Search by reference" value="${esc(ui.q)}">
      <select class="input" id="st" aria-label="Filter by status"><option value="">All statuses</option><option value="new">New</option><option value="contacted">Contacted</option><option value="completed">Completed</option></select>
      <button class="btn btn--outline" type="button" id="purge" hidden></button>
    </div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Ref</th><th>Product</th><th>Date</th><th>Prescription</th><th>Delivery</th><th>Name</th><th>Status</th><th></th></tr></thead>
    <tbody id="rows"><tr><td colspan="8">Loading…</td></tr></tbody></table></div>
    <div class="pager" id="pager"></div>`;
  const $ = (s) => main.querySelector(s);
  $("#st").value = ui.status;
  let t; $("#q").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { ui.q = e.target.value.trim(); ui.page = 0; load(main); }, 250); });
  $("#st").addEventListener("change", (e) => { ui.status = e.target.value; ui.page = 0; load(main); });
  $("#purge").addEventListener("click", () => purge(main));
  $("#pager").addEventListener("click", (e) => { const b = e.target.closest("[data-pg]"); if (b) { ui.page += +b.dataset.pg; load(main); } });

  main.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const tr = b.closest("tr"), id = tr.dataset.id, path = tr.dataset.path;
    if (b.dataset.act === "view") {
      const win = window.open("", "_blank");
      const { data, error } = await state.sb.storage.from("prescriptions").createSignedUrl(path, 60);
      if (error) { win?.close(); return fail(error, "Could not open prescription"); }
      if (win) win.location.href = data.signedUrl; else location.href = data.signedUrl;
    }
    if (b.dataset.act === "delete") {
      if (!(await confirmDialog(`Delete inquiry ${tr.dataset.ref}${path ? " and its prescription" : ""}?`))) return;
      if (path) { const r = await state.sb.storage.from("prescriptions").remove([path]); if (r.error) return fail(r.error, "Prescription not deleted"); }
      const { error } = await state.sb.from("inquiries").delete().eq("id", id);
      if (error) return fail(error, "Not deleted");
      tr.remove(); toast("Deleted");
    }
  });
  main.addEventListener("change", async (e) => {
    const s = e.target.closest("[data-status]"); if (!s) return;
    const id = s.closest("tr").dataset.id, prev = s.dataset.prev;
    s.dataset.prev = s.value; // optimistic
    const { error } = await state.sb.from("inquiries").update({ status: s.value }).eq("id", id);
    if (error) { s.value = prev; s.dataset.prev = prev; fail(error, "Status not saved"); } else toast("Status updated");
  });
  await load(main);
}

const cutoff = () => new Date(Date.now() - OLD_DAYS * 86400000).toISOString();

async function load(main) {
  let q = state.sb.from("inquiries").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (ui.q) q = q.ilike("ref", `%${ui.q.replace(/[%,]/g, "")}%`);
  if (ui.status) q = q.eq("status", ui.status);
  const { data, error, count } = await q.range(ui.page * PER, ui.page * PER + PER - 1);
  const body = main.querySelector("#rows");
  if (error) { body.innerHTML = `<tr><td colspan="8">${esc(error.message)}</td></tr>`; return; }
  const old = cutoff();
  body.innerHTML = data.length ? data.map((r) => {
    const s = r.product_snapshot || {};
    const isOld = r.prescription_path && r.created_at < old;
    return `<tr data-id="${r.id}" data-ref="${esc(r.ref)}" data-path="${esc(r.prescription_path || "")}" class="${isOld ? "flag" : ""}">
      <td><strong>${esc(r.ref)}</strong></td>
      <td class="wrap">${s.url ? `<a class="link link--static" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(`${s.brand || ""} ${s.name || ""}`.trim())}</a>` : esc(`${s.brand || ""} ${s.name || ""}`)}<br><span class="hint">${s.colour ? esc(s.colour) + " · " : ""}${s.price != null ? formatPrice(s.price) : ""}</span></td>
      <td>${fmtDate(r.created_at)}</td>
      <td>${RX[r.prescription_status] || ""}${r.prescription_path ? ` <button class="btn btn--outline btn-sm" type="button" data-act="view">View</button>` : ""}${isOld ? ' <span class="tag">90+ days</span>' : ""}</td>
      <td>${r.delivery === "pickup" ? "Store pickup" : "Home delivery"}</td>
      <td>${esc(r.customer_name || "—")}</td>
      <td><select class="input" data-status data-prev="${r.status}" aria-label="Status for ${esc(r.ref)}">${["new", "contacted", "completed"].map((x) => `<option value="${x}" ${x === r.status ? "selected" : ""}>${x[0].toUpperCase() + x.slice(1)}</option>`).join("")}</select></td>
      <td><button class="btn btn--outline btn-sm" type="button" data-act="delete">Delete</button></td></tr>`;
  }).join("") : `<tr><td colspan="8"><div class="empty-state">${ui.q ? "No inquiry with that reference." : "No inquiries yet."}</div></td></tr>`;

  const pages = Math.max(1, Math.ceil((count || 0) / PER));
  main.querySelector("#pager").innerHTML = `<span>${count || 0} inquiries · page ${ui.page + 1} of ${pages}</span>
    <button class="btn btn--outline btn-sm" type="button" data-pg="-1" ${ui.page === 0 ? "disabled" : ""}>Previous</button>
    <button class="btn btn--outline btn-sm" type="button" data-pg="1" ${ui.page + 1 >= pages ? "disabled" : ""}>Next</button>`;

  // how many prescriptions are older than 90 days?
  const { count: oldCount } = await state.sb.from("inquiries").select("id", { count: "exact", head: true }).not("prescription_path", "is", null).lt("created_at", old);
  const btn = main.querySelector("#purge");
  btn.hidden = !oldCount;
  btn.textContent = `Delete old prescriptions (${oldCount || 0})`;
}

async function purge(main) {
  const { data, error } = await state.sb.from("inquiries").select("id,prescription_path").not("prescription_path", "is", null).lt("created_at", cutoff()).limit(1000);
  if (error) return fail(error, "Could not list old prescriptions");
  if (!data.length) return toast("No prescriptions older than 90 days.");
  if (!(await confirmDialog(`Delete ${data.length} prescription file${data.length > 1 ? "s" : ""} older than ${OLD_DAYS} days? The inquiries themselves are kept.`))) return;
  const paths = data.map((d) => d.prescription_path);
  for (let i = 0; i < paths.length; i += 100) {
    const r = await state.sb.storage.from("prescriptions").remove(paths.slice(i, i + 100));
    if (r.error) return fail(r.error, "Some files were not deleted");
  }
  const u = await state.sb.from("inquiries").update({ prescription_path: null }).in("id", data.map((d) => d.id));
  if (u.error) return fail(u.error, "Files deleted, but records not updated");
  toast(`Deleted ${paths.length} old prescription${paths.length > 1 ? "s" : ""}`);
  load(main);
}
