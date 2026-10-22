// ---------------------------------------------------------------------------
// Lahore Optical — site configuration
// Paste your Supabase project URL and ANON (public) key below.
// NEVER put the service-role key in this file or anywhere in the front end.
// While these still contain "YOUR_", the site runs in DEMO MODE with sample
// products so you can preview the design before connecting Supabase.
// ---------------------------------------------------------------------------
export const CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",

  // Public site URL, used for canonical links and the sitemap. Leave empty to use the current domain.
  siteUrl: "",

  whatsappNumber: "919307912469",
  phone: "+919307912469",
  landline: "+915224073433",

  // Pinned client library (supabase-js v2, loaded as an ES module from the CDN)
  supabaseModule: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm",
};

export const DEMO_MODE =
  CONFIG.supabaseUrl.includes("YOUR_") || CONFIG.supabaseAnonKey.includes("YOUR_");
