// Hidden admin at /admin. Email + password via Supabase Auth (no sign-up UI).
// Access is enforced in the database: every write policy checks that the
// signed-in user exists in public.admin_users — being logged in is not enough.
import { CONFIG, DEMO_MODE } from "../config.js";
import { state, esc, toast, fail } from "./kit.js";

const app = document.getElementById("app");
const SECTIONS = [
  ["products", "Products"],
  ["taxonomy", "Categories & Collections"],
  ["offers", "Offers (ticker)"],
  ["content", "Site content"],
  ["gallery", "Gallery"],
  ["inquiries", "Inquiries"],
];

const logo = `<div class="slot slot--logo"><span class="slot__label">Logo · 160×48</span></div>`;

async function boot() {
  if (DEMO_MODE) {
    app.innerHTML = `<div class="admin-center"><div class="login">${logo}<h1 class="h2">Admin</h1>
      <p class="body body--long">Supabase isn't connected yet. Add your project URL and anon key to <code>js/config.js</code>, run <code>supabase/schema.sql</code>, then create your admin user. The README has the steps.</p>
      <a class="link link--static" href="/">← Back to site</a></div></div>`;
    return;
  }
  const { createClient } = await import(CONFIG.supabaseModule);
  state.sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "lo-admin-auth" } });
  const { data } = await state.sb.auth.getSession();
  if (data.session) await enter(data.session); else login();
  state.sb.auth.onAuthStateChange((ev, session) => { if (ev === "SIGNED_OUT") login(); else if (session) state.session = session; });
}

function login(message = "") {
  app.innerHTML = `<main class="admin-center"><form class="login" novalidate>
    ${logo}
    <h1 class="h2">Admin sign in</h1>
    <div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="username" required></div>
    <div class="field"><label for="password">Password</label><input id="password" type="password" autocomplete="current-password" required></div>
    <p class="error" id="login-error" role="alert" ${message ? "" : "hidden"}>${esc(message)}</p>
    <button class="btn btn--solid btn--block" type="submit">Sign in</button>
  </form></main>`;
  const f = app.querySelector("form");
  f.email.focus();
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = f.querySelector("#login-error");
    if (!f.email.value || !f.password.value) { err.hidden = false; err.textContent = "Enter your email and password."; return; }
    const btn = f.querySelector("button"); btn.disabled = true; btn.textContent = "Signing in…";
    const { data, error } = await state.sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    btn.disabled = false; btn.textContent = "Sign in";
    if (error) { err.hidden = false; err.textContent = error.message; f.password.focus(); return; }
    enter(data.session);
  });
}

async function enter(session) {
  state.session = session;
  const { data, error } = await state.sb.from("admin_users").select("user_id").eq("user_id", session.user.id).maybeSingle();
  if (error || !data) {
    await state.sb.auth.signOut();
    return login("This account does not have admin access.");
  }
  shell();
}

function shell() {
  app.innerHTML = `<div class="shell">
    <aside class="side">
      ${logo}
      <nav class="side__nav" aria-label="Admin">${SECTIONS.map(([k, l]) => `<a href="#${k}" data-k="${k}">${l}</a>`).join("")}</nav>
      <div class="side__foot">
        <span class="who">${esc(state.session.user.email)}</span>
        <a class="link on-dark" href="/" target="_blank" rel="noopener" style="color:#fff">View site →</a>
        <button class="btn btn--outline on-dark btn-sm" type="button" id="signout">Sign out</button>
      </div>
    </aside>
    <main class="main" id="main" tabindex="-1"></main>
  </div>`;
  document.getElementById("signout").addEventListener("click", async () => { await state.sb.auth.signOut(); toast("Signed out"); });
  window.addEventListener("hashchange", route);
  route();
}

const loaders = {
  products: () => import("./products.js"),
  taxonomy: () => import("./taxonomy.js"),
  offers: () => import("./offers.js"),
  content: () => import("./content.js"),
  gallery: () => import("./gallery.js"),
  inquiries: () => import("./inquiries.js"),
};

async function route() {
  const key = (location.hash.slice(1).split("/")[0]) || "products";
  const k = loaders[key] ? key : "products";
  document.querySelectorAll(".side__nav a").forEach((a) => a.setAttribute("aria-current", a.dataset.k === k ? "page" : "false"));
  // fresh <main> per view so listeners from the previous section don't pile up
  const old = document.getElementById("main");
  const main = old.cloneNode(false);
  old.replaceWith(main);
  main.innerHTML = `<p class="small">Loading…</p>`;
  try {
    const mod = await loaders[k]();
    await mod.render(main, location.hash.slice(1).split("/").slice(1));
  } catch (e) { fail(e, "Could not load section"); main.innerHTML = `<p class="body">This section could not load. Check that schema.sql has been run.</p>`; }
}

boot().catch((e) => { console.error(e); app.innerHTML = `<div class="admin-center"><p class="body">Admin could not start: ${esc(e.message)}</p></div>`; });
