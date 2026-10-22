// ---------------------------------------------------------------------------
// Lahore Optical — site configuration
// Paste your Supabase project URL and ANON (public) key below.
// NEVER put the service-role key in this file or anywhere in the front end.
// While these still contain "YOUR_", the site runs in DEMO MODE with sample
// products so you can preview the design before connecting Supabase.
// ---------------------------------------------------------------------------
export const CONFIG = {
  supabaseUrl: "https://qyclijtweoxcjvyluill.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5Y2xpanR3ZW94Y2p2eWx1aWxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2ODA4MDgsImV4cCI6MjEwODI1NjgwOH0.e-vN7cQsCrJYWR2NsLKwq8wg1dd_HcLZwj33I6cF76Q",

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
