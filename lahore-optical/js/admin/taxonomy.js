import { state, esc, toast, fail, confirmDialog, sortable, handleHTML, saveOrder } from "./kit.js";
import { slugify } from "../lib/util.js";

let cats = [], cols = [], colFilter = "";

export async function render(main) {
  main.innerHTML = `<h1>Categories &amp; Collections</h1>
    <p class="hint" style="margin-bottom:16px">Category order sets the order of product sections on the home page. Turn off “Home” to hide a category's section there (its page still works).</p>
    <h2>Categories</h2>
    <ul class="sortable" id="cats"></ul>
    <form class="toolbar" id="cat-add" style="margin-top:16px">
      <input class="input grow" name="name" placeholder="New category name" aria-label="New category name" maxlength="60" required>
      <button class="btn btn--solid" type="submit">Add category</button>
    </form>
    <p class="hint">After adding a category, add a matching line to <code>_redirects</code> so its URL works (see README).</p>
    <h2>Collections</h2>
    <div class="toolbar"><select class="input" id="col-filter" aria-label="Show collections for category"></select></div>
    <ul class="sortable" id="cols"></ul>
    <form class="toolbar" id="col-add" style="margin-top:16px">
      <input class="input grow" name="name" placeholder="New collection name" aria-label="New collection name" maxlength="60" required>
      <select class="input" name="category_id" aria-label="Category for new collection"></select>
      <button class="btn btn--solid" type="submit">Add collection</button>
    </form>`;
  await load();
  paint(main);
  const $ = (s) => main.querySelector(s);

  sortable($("#cats"), async (ids) => { try { await saveOrder("categories", ids); cats = ids.map((id) => cats.find((c) => c.id === id)); toast("Order saved"); } catch (e) { fail(e, "Order not saved"); } });
  sortable($("#cols"), async (ids) => { try { await saveOrder("collections", ids); toast("Order saved"); await load(); } catch (e) { fail(e, "Order not saved"); } });

  $("#cat-add").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim(); if (!name) return;
    const { error } = await state.sb.from("categories").insert({ name, slug: slugify(name), sort_order: cats.length + 1, show_on_home: true });
    if (error) return fail(error, error.code === "23505" ? "That slug already exists" : "Not added");
    e.target.reset(); toast("Category added"); await load(); paint(main);
  });
  $("#col-add").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim(); if (!name) return;
    const category_id = e.target.category_id.value;
    const { error } = await state.sb.from("collections").insert({ name, slug: slugify(name), category_id, sort_order: cols.filter((c) => c.category_id === category_id).length + 1 });
    if (error) return fail(error, error.code === "23505" ? "That slug already exists" : "Not added");
    e.target.reset(); toast("Collection added"); await load(); paint(main);
  });
  $("#col-filter").addEventListener("change", (e) => { colFilter = e.target.value; paint(main); });

  main.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const li = b.closest("li"), table = li.closest("#cats") ? "categories" : "collections", id = li.dataset.id;
    if (b.dataset.act === "save") {
      const row = { name: li.querySelector("[data-name]").value.trim(), slug: slugify(li.querySelector("[data-slug]").value) };
      if (table === "collections") row.category_id = li.querySelector("[data-cat]").value;
      const { error } = await state.sb.from(table).update(row).eq("id", id);
      if (error) return fail(error, "Not saved");
      toast("Saved"); await load(); paint(main);
    }
    if (b.dataset.act === "delete") {
      const label = li.querySelector("[data-name]").value;
      const msg = table === "categories" ? `Delete the category “${label}”? Products in it must be moved or deleted first.` : `Delete the collection “${label}”?`;
      if (!(await confirmDialog(msg))) return;
      const { error } = await state.sb.from(table).delete().eq("id", id);
      if (error) return fail(error, error.code === "23503" ? "It still has products" : "Not deleted");
      toast("Deleted"); await load(); paint(main);
    }
  });
  main.addEventListener("change", async (e) => {
    const c = e.target.closest("[data-home]"); if (!c) return;
    const id = c.closest("li").dataset.id;
    const { error } = await state.sb.from("categories").update({ show_on_home: c.checked }).eq("id", id);
    if (error) { c.checked = !c.checked; fail(error, "Not saved"); } else toast(c.checked ? "Shown on home page" : "Hidden from home page");
  });
}

async function load() {
  const [a, b] = await Promise.all([
    state.sb.from("categories").select("*").order("sort_order"),
    state.sb.from("collections").select("*").order("sort_order"),
  ]);
  if (a.error) throw a.error; if (b.error) throw b.error;
  cats = a.data; cols = b.data;
  if (!colFilter && cats[0]) colFilter = cats[0].id;
}

function paint(main) {
  const catOpts = (sel) => cats.map((c) => `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  main.querySelector("#cats").innerHTML = cats.map((c) => `<li data-id="${c.id}">${handleHTML(c.name)}
    <div class="grow" style="grid-template-columns:1fr 1fr;display:grid">
      <input class="input" data-name value="${esc(c.name)}" aria-label="Category name" maxlength="60">
      <input class="input" data-slug value="${esc(c.slug)}" aria-label="Category slug" maxlength="60">
    </div>
    <label class="switch"><input type="checkbox" data-home ${c.show_on_home ? "checked" : ""}> Home</label>
    <button class="btn btn--outline btn-sm" type="button" data-act="save">Save</button>
    <button class="btn btn--outline btn-sm" type="button" data-act="delete">Delete</button></li>`).join("") || `<li class="hint">No categories yet.</li>`;
  main.querySelector("#col-filter").innerHTML = catOpts(colFilter);
  main.querySelector('#col-add [name="category_id"]').innerHTML = catOpts(colFilter);
  const shown = cols.filter((c) => c.category_id === colFilter);
  main.querySelector("#cols").innerHTML = shown.map((c) => `<li data-id="${c.id}">${handleHTML(c.name)}
    <div class="grow" style="grid-template-columns:1fr 1fr 1fr;display:grid">
      <input class="input" data-name value="${esc(c.name)}" aria-label="Collection name" maxlength="60">
      <input class="input" data-slug value="${esc(c.slug)}" aria-label="Collection slug" maxlength="60">
      <select class="input" data-cat aria-label="Category">${catOpts(c.category_id)}</select>
    </div>
    <a class="link" href="/collections/${esc(c.slug)}" target="_blank" rel="noopener">View</a>
    <button class="btn btn--outline btn-sm" type="button" data-act="save">Save</button>
    <button class="btn btn--outline btn-sm" type="button" data-act="delete">Delete</button></li>`).join("") || `<li class="hint">No collections in this category.</li>`;
}
