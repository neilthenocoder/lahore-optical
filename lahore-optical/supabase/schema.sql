-- ============================================================================
-- Lahore Optical — Supabase schema
-- Run once in Supabase Dashboard → SQL Editor (safe to re-run).
-- Creates tables, Row Level Security, storage buckets + policies and seed rows.
-- Not e-commerce: there are no payment tables or columns anywhere.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 60),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order    int  not null default 0,
  show_on_home  boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.collections (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 60),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category_id  uuid not null references public.categories(id) on delete cascade,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  name              text not null check (char_length(name) between 1 and 140),
  brand             text not null check (char_length(brand) between 1 and 80),
  category_id       uuid not null references public.categories(id) on delete restrict,
  price             numeric(10,2) not null check (price >= 0),
  compare_at_price  numeric(10,2) null check (compare_at_price is null or compare_at_price >= 0),
  description       text check (description is null or char_length(description) <= 2000),
  shape             text check (shape is null or char_length(shape) <= 40),
  material          text check (material is null or char_length(material) <= 60),
  size              text check (size is null or char_length(size) <= 40),
  gender            text check (gender is null or gender in ('men','women','unisex','kids')),
  images            jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array'),   -- [{url, alt}]
  variants          jsonb not null default '[]'::jsonb check (jsonb_typeof(variants) = 'array'), -- [{name, image_url}]
  tryon_png         text null,
  tryon_scale       numeric not null default 2.1 check (tryon_scale between 0.5 and 5),
  tryon_offset_y    numeric not null default 0 check (tryon_offset_y between -1 and 1),
  is_active         boolean not null default true,
  is_featured       boolean not null default false,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.product_collections (
  product_id     uuid not null references public.products(id) on delete cascade,
  collection_id  uuid not null references public.collections(id) on delete cascade,
  primary key (product_id, collection_id)
);

create table if not exists public.offers (
  id          uuid primary key default gen_random_uuid(),
  text        text not null check (char_length(text) between 1 and 140),
  link        text null check (link is null or char_length(link) <= 300),
  starts_at   timestamptz null,
  ends_at     timestamptz null,
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.site_content (
  key         text primary key,
  value       text check (value is null or char_length(value) <= 2000),
  type        text not null check (type in ('image','text','url')),
  updated_at  timestamptz not null default now()
);

create table if not exists public.gallery_images (
  id          uuid primary key default gen_random_uuid(),
  url         text not null,
  alt         text not null default '' check (char_length(alt) <= 200),
  sort_order  int not null default 0,
  visible     boolean not null default true,
  created_at  timestamptz not null default now()
);

-- WhatsApp order enquiries (leads, not orders: no amounts due, no payment status)
create table if not exists public.inquiries (
  id                   uuid primary key default gen_random_uuid(),
  ref                  text not null unique check (ref ~ '^LO-[0-9A-Z]{5}$'),
  product_id           uuid null references public.products(id) on delete set null,
  product_snapshot     jsonb not null default '{}'::jsonb
                         check (jsonb_typeof(product_snapshot) = 'object' and pg_column_size(product_snapshot) <= 4000),
  prescription_status  text not null check (prescription_status in ('uploaded','will_send','not_needed')),
  prescription_path    text null check (prescription_path is null or (char_length(prescription_path) <= 200 and prescription_path like 'inquiries/' || ref || '/%')),
  customer_name        text null check (customer_name is null or char_length(customer_name) <= 80),
  delivery             text not null default 'home' check (delivery in ('home','pickup')),
  status               text not null default 'new' check (status in ('new','contacted','completed')),
  created_at           timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists site_content_updated_at on public.site_content;
create trigger site_content_updated_at before update on public.site_content
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes & view
-- ---------------------------------------------------------------------------
create index if not exists products_listing_idx   on public.products (category_id, is_active, sort_order);
create index if not exists products_slug_idx      on public.products (slug);   -- (unique constraint also indexes it)
create index if not exists products_featured_idx  on public.products (is_featured) where is_featured;
create index if not exists products_tryon_idx     on public.products (category_id) where tryon_png is not null;
create index if not exists pc_collection_idx      on public.product_collections (collection_id);
create index if not exists inquiries_ref_idx      on public.inquiries (ref);
create index if not exists inquiries_created_idx  on public.inquiries (created_at desc);

create or replace view public.products_with_collections
with (security_invoker = true) as
  select p.*,
         coalesce(array_agg(pc.collection_id) filter (where pc.collection_id is not null), '{}') as collection_ids
  from public.products p
  left join public.product_collections pc on pc.product_id = p.id
  group by p.id;

-- ---------------------------------------------------------------------------
-- Admin check (security definer so it can read admin_users under RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Grants (RLS below decides which rows)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.categories, public.collections, public.product_collections, public.products,
                public.offers, public.site_content, public.gallery_images, public.products_with_collections
  to anon, authenticated;
grant insert on public.inquiries to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.admin_users from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.categories          enable row level security;
alter table public.collections         enable row level security;
alter table public.products            enable row level security;
alter table public.product_collections enable row level security;
alter table public.offers              enable row level security;
alter table public.site_content        enable row level security;
alter table public.gallery_images      enable row level security;
alter table public.inquiries           enable row level security;
alter table public.admin_users         enable row level security;

-- public read
drop policy if exists "public read categories" on public.categories;
create policy "public read categories" on public.categories for select to anon, authenticated using (true);

drop policy if exists "public read collections" on public.collections;
create policy "public read collections" on public.collections for select to anon, authenticated using (true);

drop policy if exists "public read product_collections" on public.product_collections;
create policy "public read product_collections" on public.product_collections for select to anon, authenticated using (true);

drop policy if exists "public read active products" on public.products;
create policy "public read active products" on public.products for select to anon, authenticated
  using (is_active or public.is_admin());

drop policy if exists "public read live offers" on public.offers;
create policy "public read live offers" on public.offers for select to anon, authenticated
  using ((active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())) or public.is_admin());

drop policy if exists "public read site_content" on public.site_content;
create policy "public read site_content" on public.site_content for select to anon, authenticated using (true);

drop policy if exists "public read visible gallery" on public.gallery_images;
create policy "public read visible gallery" on public.gallery_images for select to anon, authenticated
  using (visible or public.is_admin());

-- inquiries: the public may only INSERT (no select / update / delete)
drop policy if exists "public insert inquiries" on public.inquiries;
create policy "public insert inquiries" on public.inquiries for insert to anon, authenticated
  with check (status = 'new');

-- admin: full CRUD everywhere
do $$
declare t text;
begin
  foreach t in array array['categories','collections','products','product_collections','offers','site_content','gallery_images','inquiries']
  loop
    execute format('drop policy if exists "admin all %1$s" on public.%1$I', t);
    execute format('create policy "admin all %1$s" on public.%1$I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- admin_users: a signed-in user may only see their own row (used by /admin to check access).
-- Rows are added only from the SQL editor (see README).
drop policy if exists "read own admin row" on public.admin_users;
create policy "read own admin row" on public.admin_users for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('products',      'products',      true,  10485760, array['image/webp','image/jpeg','image/png']),
  ('site',          'site',          true,  52428800, array['image/webp','image/jpeg','image/png','video/mp4','video/webm']),
  ('gallery',       'gallery',       true,  10485760, array['image/webp','image/jpeg','image/png']),
  ('prescriptions', 'prescriptions', false, 8388608,  array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update set
  public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- public buckets: anyone can read via the public URL; only admins write
drop policy if exists "lo admin write public buckets" on storage.objects;
create policy "lo admin write public buckets" on storage.objects for all to authenticated
  using (bucket_id in ('products','site','gallery') and public.is_admin())
  with check (bucket_id in ('products','site','gallery') and public.is_admin());

-- prescriptions (PRIVATE): anon may only insert under inquiries/{ref}/{file}
-- (8 MB and JPG/PNG/PDF enforced by the bucket settings above). No public read.
drop policy if exists "lo anon upload prescriptions" on storage.objects;
create policy "lo anon upload prescriptions" on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'prescriptions'
    and (storage.foldername(name))[1] = 'inquiries'
    and array_length(storage.foldername(name), 1) = 2
  );

drop policy if exists "lo admin read prescriptions" on storage.objects;
create policy "lo admin read prescriptions" on storage.objects for select to authenticated
  using (bucket_id = 'prescriptions' and public.is_admin());

drop policy if exists "lo admin delete prescriptions" on storage.objects;
create policy "lo admin delete prescriptions" on storage.objects for delete to authenticated
  using (bucket_id = 'prescriptions' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Seed rows
-- ---------------------------------------------------------------------------
insert into public.categories (name, slug, sort_order, show_on_home) values
  ('Frames', 'frames', 1, true),
  ('Sunglasses', 'sunglasses', 2, true),
  ('Lenses', 'lenses', 3, true),
  ('Contact Lenses', 'contact-lenses', 4, true)
on conflict (slug) do nothing;

-- Lens collections from the lens types Lahore Optical offers
insert into public.collections (name, slug, category_id, sort_order)
select v.name, v.slug, c.id, v.sort_order
from (values
  ('Single Vision', 'single-vision', 1),
  ('Progressive', 'progressive', 2),
  ('Digital / Blue-light', 'digital-blue-light', 3),
  ('High-index', 'high-index', 4),
  ('Coatings', 'coatings', 5)
) as v(name, slug, sort_order)
join public.categories c on c.slug = 'lenses'
on conflict (slug) do nothing;

-- Every editable data-slot image and text key (values empty = placeholder shown)
insert into public.site_content (key, value, type) values
  ('logo', '', 'image'),
  ('hero_image', '', 'image'),
  ('hero_h1', 'See well. Look better.', 'text'),
  ('hero_subline', '500+ genuine frames, expert eye tests and 2-hour delivery across Lucknow.', 'text'),
  ('tryon_band_media', '', 'image'),
  ('eyecare_image', '', 'image'),
  ('visit_image', '', 'image'),
  ('legacy_image', '', 'image'),
  ('review_quote_1', '[REVIEW QUOTE]', 'text'),
  ('review_author_1', '[REVIEWER NAME]', 'text'),
  ('review_quote_2', '[REVIEW QUOTE]', 'text'),
  ('review_author_2', '[REVIEWER NAME]', 'text'),
  ('review_quote_3', '[REVIEW QUOTE]', 'text'),
  ('review_author_3', '[REVIEWER NAME]', 'text'),
  ('opening_hours', '[OPENING HOURS]', 'text'),
  ('email', '[EMAIL]', 'text'),
  ('instagram_url', '', 'url'),
  ('facebook_url', '', 'url'),
  ('youtube_url', '', 'url'),
  ('google_reviews_url', '', 'url'),
  ('maps_url', '', 'url')
on conflict (key) do nothing;

-- One example offer, inactive (turn it on or edit it in /admin → Offers)
insert into public.offers (text, link, active, sort_order)
select '2-hour delivery across Lucknow', '/#guarantee', false, 1
where not exists (select 1 from public.offers);

-- ---------------------------------------------------------------------------
-- After creating your admin user in Authentication → Users, run:
--   insert into public.admin_users (user_id)
--   select id from auth.users where email = 'owner@example.com';
-- ---------------------------------------------------------------------------
