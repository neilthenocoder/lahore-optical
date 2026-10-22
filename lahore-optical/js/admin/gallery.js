import { state, esc, toast, fail, confirmDialog, uploadImage, sortable, handleHTML, saveOrder, pathFromPublicUrl } from "./kit.js";

let items = [];

export async function render(main) {
  main.innerHTML = `<h1>Gallery</h1>
    <p class="hint" style="margin-bottom:16px">Photos for the scrolling gallery in the “90 years” section. Portrait 3:4 works best. Drag to reorder.</p>
    <div class="toolbar"><label class="btn btn--solid" style="cursor:pointer">Add photos<input type="file" multiple accept="image/webp,image/jpeg,image/png" class="sr-only" id="up"></label></div>
    <ul class="sortable" id="list"></ul>`;
  await load(); paint(main);
  const $ = (s) => main.querySelector(s);
  sortable($("#list"), async (ids) => { try { await saveOrder("gallery_images", ids); items = ids.map((id) => items.find((x) => x.id === id)); toast("Order saved"); } catch (e) { fail(e, "Order not saved"); } });

  $("#up").addEventListener("change", async (e) => {
    const files = [...e.target.files]; e.target.value = "";
    let n = items.length;
    for (const file of files) {
      try {
        const url = await uploadImage("gallery", "shop", file);
        if (!url) continue;
        const { error } = await state.sb.from("gallery_images").insert({ url, alt: "Lahore Optical shop", sort_order: ++n, visible: true });
        if (error) throw error;
      } catch (err) { fail(err, `Could not add ${file.name}`); }
    }
    await load(); paint(main); toast("Gallery updated");
  });

  main.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const li = b.closest("li"), id = li.dataset.id, it = items.find((x) => x.id === id);
    if (b.dataset.act === "save") {
      const { error } = await state.sb.from("gallery_images").update({ alt: li.querySelector("[data-alt]").value.trim() }).eq("id", id);
      if (error) return fail(error, "Not saved"); toast("Saved");
    }
    if (b.dataset.act === "delete") {
      if (!(await confirmDialog("Delete this photo?"))) return;
      const { error } = await state.sb.from("gallery_images").delete().eq("id", id);
      if (error) return fail(error, "Not deleted");
      const p = pathFromPublicUrl("gallery", it?.url); if (p) await state.sb.storage.from("gallery").remove([p]);
      items = items.filter((x) => x.id !== id); paint(main); toast("Deleted");
    }
  });
  main.addEventListener("change", async (e) => {
    const c = e.target.closest("[data-vis]"); if (!c) return;
    const id = c.closest("li").dataset.id;
    c.closest("li").classList.toggle("muted-row", !c.checked); // optimistic
    const { error } = await state.sb.from("gallery_images").update({ visible: c.checked }).eq("id", id);
    if (error) { c.checked = !c.checked; c.closest("li").classList.toggle("muted-row", !c.checked); fail(error, "Not saved"); } else toast(c.checked ? "Visible" : "Hidden");
  });
}

async function load() {
  const { data, error } = await state.sb.from("gallery_images").select("*").order("sort_order");
  if (error) throw error;
  items = data;
}

function paint(main) {
  main.querySelector("#list").innerHTML = items.map((it, i) => `<li data-id="${it.id}" class="${it.visible ? "" : "muted-row"}">${handleHTML("photo " + (i + 1))}
    <div class="thumb"><img src="${esc(it.url)}" alt=""></div>
    <div class="grow"><label class="hint" for="alt-${it.id}">Alt text</label><input class="input" id="alt-${it.id}" data-alt value="${esc(it.alt || "")}" maxlength="200"></div>
    <label class="switch"><input type="checkbox" data-vis ${it.visible ? "checked" : ""}> Visible</label>
    <button class="btn btn--outline btn-sm" type="button" data-act="save">Save alt</button>
    <button class="btn btn--outline btn-sm" type="button" data-act="delete">Delete</button></li>`).join("") || `<li class="hint">No photos yet. Grey placeholders show on the site until you add some.</li>`;
}
