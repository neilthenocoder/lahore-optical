import { state, esc, toast, fail, confirmDialog, sortable, handleHTML, saveOrder, toLocalInput, fromLocalInput } from "./kit.js";

let offers = [];

export async function render(main) {
  main.innerHTML = `<h1>Offers (ticker)</h1>
    <p class="hint" style="margin-bottom:16px">Offers are announcements in the black bar above the header. They never change prices. The bar only shows offers that are active and within their dates, and hides itself when there are none.</p>
    <h2>Live preview</h2>
    <div class="ticker-preview" id="preview"></div>
    <h2>Offers</h2>
    <ul class="sortable" id="list"></ul>
    <form class="panel" id="add" style="margin-top:16px">
      <h2>Add an offer</h2>
      <div class="form-grid">
        <div class="field full"><label for="n-text">Text *</label><input id="n-text" name="text" type="text" maxlength="140" required></div>
        <div class="field full"><label for="n-link">Link (optional)</label><input id="n-link" name="link" type="text" maxlength="300" placeholder="/frames or https://…"></div>
        <div class="field"><label for="n-start">Starts</label><input id="n-start" name="starts_at" type="datetime-local"></div>
        <div class="field"><label for="n-end">Ends</label><input id="n-end" name="ends_at" type="datetime-local"></div>
      </div>
      <label class="switch"><input type="checkbox" name="active" checked> Active</label>
      <div><button class="btn btn--solid" type="submit">Add offer</button></div>
    </form>`;
  await load(); paint(main);
  const $ = (s) => main.querySelector(s);
  sortable($("#list"), async (ids) => { try { await saveOrder("offers", ids); offers = ids.map((id) => offers.find((o) => o.id === id)); preview(main); toast("Order saved"); } catch (e) { fail(e, "Order not saved"); } });

  $("#add").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.text.value.trim()) { f.text.focus(); return; }
    const row = { text: f.text.value.trim(), link: f.link.value.trim() || null, starts_at: fromLocalInput(f.starts_at.value), ends_at: fromLocalInput(f.ends_at.value), active: f.active.checked, sort_order: offers.length + 1 };
    const { error } = await state.sb.from("offers").insert(row);
    if (error) return fail(error, "Not added");
    f.reset(); f.active.checked = true; toast("Offer added"); await load(); paint(main);
  });

  main.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const li = b.closest("li"), id = li.dataset.id;
    if (b.dataset.act === "save") {
      const g = (k) => li.querySelector(`[data-f="${k}"]`);
      const row = { text: g("text").value.trim(), link: g("link").value.trim() || null, starts_at: fromLocalInput(g("starts_at").value), ends_at: fromLocalInput(g("ends_at").value), active: g("active").checked };
      if (!row.text) return toast("Offer text can't be empty", "error");
      const { error } = await state.sb.from("offers").update(row).eq("id", id);
      if (error) return fail(error, "Not saved");
      toast("Saved"); await load(); paint(main);
    }
    if (b.dataset.act === "delete") {
      if (!(await confirmDialog("Delete this offer?"))) return;
      const prev = offers; offers = offers.filter((o) => o.id !== id); paint(main); // optimistic
      const { error } = await state.sb.from("offers").delete().eq("id", id);
      if (error) { offers = prev; paint(main); return fail(error, "Not deleted"); }
      toast("Deleted");
    }
  });
}

async function load() {
  const { data, error } = await state.sb.from("offers").select("*").order("sort_order");
  if (error) throw error;
  offers = data;
}

const live = (o) => { const n = Date.now(); return o.active && (!o.starts_at || Date.parse(o.starts_at) <= n) && (!o.ends_at || Date.parse(o.ends_at) >= n); };

function paint(main) {
  main.querySelector("#list").innerHTML = offers.map((o) => `<li data-id="${o.id}" class="${live(o) ? "" : "muted-row"}">${handleHTML("offer")}
    <div class="grow">
      <input class="input" data-f="text" value="${esc(o.text)}" maxlength="140" aria-label="Offer text">
      <input class="input" data-f="link" value="${esc(o.link || "")}" maxlength="300" placeholder="Link (optional)" aria-label="Offer link">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label class="hint">Starts<input class="input" type="datetime-local" data-f="starts_at" value="${toLocalInput(o.starts_at)}"></label>
        <label class="hint">Ends<input class="input" type="datetime-local" data-f="ends_at" value="${toLocalInput(o.ends_at)}"></label>
      </div>
    </div>
    <label class="switch"><input type="checkbox" data-f="active" ${o.active ? "checked" : ""}> Active</label>
    ${live(o) ? '<span class="tag tag--solid">Live</span>' : '<span class="tag">Not showing</span>'}
    <button class="btn btn--outline btn-sm" type="button" data-act="save">Save</button>
    <button class="btn btn--outline btn-sm" type="button" data-act="delete">Delete</button></li>`).join("") || `<li class="hint">No offers yet.</li>`;
  preview(main);
}

function preview(main) {
  const items = offers.filter(live);
  const el = main.querySelector("#preview");
  if (!items.length) { el.innerHTML = `<p class="hint" style="padding:12px">No live offers — the bar is hidden on the site.</p>`; return; }
  const html = items.map((o) => `<span class="ticker__item">${o.link ? `<a href="${esc(o.link)}" tabindex="-1">${esc(o.text)}</a>` : esc(o.text)}</span><span class="ticker__sep">·</span>`).join("");
  el.innerHTML = `<div class="ticker"><span class="ticker__tag">OFFER</span><div class="ticker__viewport"><div class="ticker__track" style="--dur:30s">
    <div class="ticker__group">${html}${html}</div><div class="ticker__group" aria-hidden="true">${html}${html}</div></div></div></div>`;
}
