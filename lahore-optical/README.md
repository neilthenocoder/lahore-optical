# Lahore Optical website

A static site (HTML, CSS and vanilla JS modules) with a Supabase backend, hosted on Netlify. It has no build step.

This is **not an online shop**. Every product leads to **Order on WhatsApp**. There is no cart, no checkout and no payment integration. Orders and payment are confirmed directly with the shop.

Until you add Supabase keys, the site runs in **demo mode** with sample products, so you can preview the design straight away.

---

## Setup (about 15 minutes)

### 1. Create a Supabase project
Go to [supabase.com](https://supabase.com) and create a new project. Pick a region near India, such as Mumbai.

### 2. Run the SQL
Open **SQL Editor**, paste the whole of `supabase/schema.sql` and click **Run**. This creates:
- the tables
- Row Level Security policies
- the storage buckets (`products`, `site`, `gallery`, and the private `prescriptions` bucket)
- seed rows (four categories, the lens collections and every site-content key)

The script is safe to run again.

### 3. Create the admin user
1. Go to **Authentication → Users → Add user**. Choose **Create new user**, enter an email and a strong password, and tick **Auto confirm**.
2. Back in **SQL Editor**, run this with that email:
   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email = 'owner@example.com';
   ```
   Only users in `admin_users` can change anything. Being signed in is not enough.
3. Recommended: in **Authentication → Providers → Email**, turn off **Allow new users to sign up**.

### 4. Paste your keys
Go to **Project Settings → API** and copy the **Project URL** and the **anon public** key into `js/config.js`:

```js
supabaseUrl: "https://abcd1234.supabase.co",
supabaseAnonKey: "eyJhbGciOi…",
siteUrl: "https://www.your-domain.com",   // optional, used for canonical links
```

Never use the `service_role` key anywhere in this site.

### 5. Deploy to Netlify
Choose one of these:
- **Drag and drop:** Netlify → **Add new site → Deploy manually**, then drop this whole folder (or the zip, unzipped).
- **Git / Netlify CLI (recommended):** this also deploys the product-sitemap function. If you use it, add the environment variables `SUPABASE_URL` and `SUPABASE_ANON_KEY` (and optionally `SITE_URL`) under **Site configuration → Environment variables**.

Then replace `[SITE_DOMAIN]` in `robots.txt` and `sitemap.xml` with your domain.

### 6. Add content
Open `https://your-site/admin`. No link to it appears anywhere on the site. Sign in, then:
1. **Site content:** upload the logo, hero, eye-care, Gate 3, 1936 and try-on media, and fill in the hours, email, social, Maps and Google reviews links.
2. **Categories & Collections:** add frame collections (e.g. Classic, Titanium) and reorder the home-page sections.
3. **Products:** add products one by one or with **Import CSV** (download the template first), then add images and a try-on PNG to each.
4. **Gallery:** shop photos for the scrolling strip.
5. **Offers:** text for the black **OFFER** bar. It hides itself when no offer is live.

---

## How things work

| Area | Notes |
|---|---|
| Pretty URLs | `_redirects` rewrites `/frames` → `category.html` and `/frames/:slug` → `product.html`. **If you add a new category in admin**, copy its two lines in `_redirects` and redeploy. `/collections/:slug` works for every collection automatically. |
| Listings | "Show more" (load-more), never infinite scroll. Home shows 12 per category (8 on phones) up to 24, then "View all". Category pages load 24 at a time, keep `?page=N` in the URL and restore scroll position on Back. |
| Order on WhatsApp | A two-step sheet asks about the prescription and the delivery choice. It then creates an `inquiries` row with a reference like `LO-7F3K2`, uploads the prescription to the **private** bucket, and opens WhatsApp with the product, reference, prescription status and link. The prescription link is never put in the message: staff open it in **Admin → Inquiries** through a link that expires after 60 seconds. If saving fails, WhatsApp still opens. |
| Try-on | `js/lib/tryon.js` uses Google MediaPipe Face Landmarker, loaded only when try-on opens. Everything runs on the visitor's device. Each product needs a transparent front-view PNG. Tune scale and offset in the product editor using a sample face photo. |
| Images | Every image is a `#333` placeholder (`data-slot`) with a fixed aspect ratio until a real image is set, so there is no layout shift. Admin uploads are resized to max 2000px and converted to WebP in the browser (PNG is kept for try-on images). |
| Old prescriptions | Admin → Inquiries flags prescriptions older than 90 days and has a **Delete old prescriptions** button. |
| Sitemap | `sitemap.xml` lists the core pages. Products come from `/sitemap-products.xml` (a Netlify Function, Git/CLI deploys only). **Drag-and-drop alternative:** Admin → Products → **Download sitemap.xml**, replace the file in this folder and redeploy. |

## Placeholders to fill
These appear on the site as visible `[PLACEHOLDER]` text until you set them:
- `[OPENING HOURS]`, `[EMAIL]`, `[REVIEW QUOTE]`, `[REVIEWER NAME]` and the social URLs. Set these in Admin → Site content.
- `[CONFIRM: eye test pricing]`, in `index.html` (hero proof row).
- `[LAT]` / `[LNG]`, `[OPENING HOURS]` and `[SITE_DOMAIN]` in the `Optician` JSON-LD in `index.html`.
- `[SITE_DOMAIN]` in `robots.txt` and `sitemap.xml`.
- The Privacy and Terms page text.
- `og-image.jpg`, the social share image (1200×630).

The Directions and Google-reviews buttons link to a Google Maps search for the shop until you add the exact links in admin.

## Local preview
Run `npx netlify-cli dev` in this folder. This applies `_redirects`, so `/frames` and similar URLs work. A plain static server works for `index.html`, but the pretty URLs won't.

## File map
```
index.html  category.html  product.html  try-on.html  404.html  admin.html  privacy.html  terms.html
css/styles.css            design system (only #000 / #FFF / #333, Geist, 0px radius)
css/admin.css             admin layout
js/config.js              Supabase URL + anon key
js/lib/                   data layer, shared UI, product card, order sheet, try-on engine, demo data
js/pages/                 one module per public page
js/admin/                 admin sections
supabase/schema.sql       tables, RLS, buckets, seeds
netlify/functions/        product sitemap
_redirects  netlify.toml  robots.txt  sitemap.xml
```
