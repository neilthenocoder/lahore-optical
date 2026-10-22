import { initCommon, observeReveal } from "../lib/common.js";
import { $ } from "../lib/util.js";
import { listProducts } from "../lib/data.js";
import { cardHTML, skeletonHTML } from "../lib/card.js";

initCommon();

(async () => {
  const grid = $("#featured-grid");
  grid.innerHTML = skeletonHTML(4);
  try {
    let { rows } = await listProducts({ featured: true, from: 0, to: 3 });
    if (rows.length < 4) rows = rows.concat((await listProducts({ from: 0, to: 7 })).rows.filter((r) => !rows.some((x) => x.id === r.id))).slice(0, 4);
    grid.innerHTML = rows.map((p) => cardHTML(p)).join("");
    if (!rows.length) grid.closest("section").hidden = true;
    observeReveal(grid);
  } catch (e) { console.warn(e); grid.closest("section").hidden = true; }
})();
