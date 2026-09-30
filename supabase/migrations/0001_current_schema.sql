-- Current Supabase schema for San Cristobal Car House
-- No production data or private service keys are included.

create extension if not exists pgcrypto;

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  brand text not null,
  model text not null,
  version text,
  year integer not null check (year between 1950 and 2100),
  kilometers integer not null default 0 check (kilometers >= 0),
  price numeric,
  currency text not null default 'USD' check (currency in ('USD','ARS')),
  fuel text,
  transmission text,
  engine text,
  color text,
  location text default 'Buenos Aires',
  description text,
  features text[] not null default '{}',
  cover_image text,
  images text[] not null default '{}',
  status text not null default 'available' check (status in ('available','reserved','sold')),
  published boolean not null default true,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicles_public_idx on public.vehicles (published, featured desc, created_at desc);
create index if not exists vehicles_slug_idx on public.vehicles (slug);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('page_view','vehicle_click','vehicle_view','whatsapp_click')),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  source text,
  path text,
  session_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at desc);
create index if not exists analytics_events_type_created_idx on public.analytics_events (event_type, created_at desc);
create index if not exists analytics_events_vehicle_idx on public.analytics_events (vehicle_id, created_at desc);

create table if not exists public.external_listings (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  channel text not null check (channel in ('mercadolibre','facebook_marketplace','other')),
  external_id text,
  listing_url text not null,
  title text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(vehicle_id, channel, listing_url)
);

create index if not exists external_listings_vehicle_idx on public.external_listings (vehicle_id);

create table if not exists public.external_metrics (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.external_listings(id) on delete cascade,
  metric_date date not null default current_date,
  views integer not null default 0 check (views >= 0),
  clicks integer not null default 0 check (clicks >= 0),
  inquiries integer not null default 0 check (inquiries >= 0),
  favorites integer not null default 0 check (favorites >= 0),
  notes text,
  created_at timestamptz not null default now(),
  unique(listing_id, metric_date)
);

create index if not exists external_metrics_listing_date_idx on public.external_metrics (listing_id, metric_date desc);

create table if not exists public.vehicle_offers (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'USD' check (currency in ('USD','ARS')),
  offer_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists vehicle_offers_vehicle_id_idx on public.vehicle_offers (vehicle_id);
create index if not exists vehicle_offers_offer_date_idx on public.vehicle_offers (offer_date desc);

-- Legacy owner-tracking table retained because the deployed Edge Functions still reference it.
create table if not exists public.owner_tracking_links (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade unique,
  token uuid not null default gen_random_uuid() unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists owner_tracking_links_token_idx on public.owner_tracking_links(token) where active = true;

-- Legacy Mercado Libre OAuth configuration table. Credentials/tokens are data, never source code.
create table if not exists public.mercadolibre_connection (
  id smallint primary key default 1,
  client_id text,
  client_secret text,
  access_token text,
  refresh_token text,
  ml_user_id bigint,
  oauth_state text,
  redirect_uri text,
  token_expires_at timestamptz,
  connected_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  oauth_code_verifier text
);

alter table public.vehicles enable row level security;
alter table public.analytics_events enable row level security;
alter table public.external_listings enable row level security;
alter table public.external_metrics enable row level security;
alter table public.vehicle_offers enable row level security;
alter table public.owner_tracking_links enable row level security;
alter table public.mercadolibre_connection enable row level security;

drop policy if exists "public can read published vehicles" on public.vehicles;
create policy "public can read published vehicles" on public.vehicles
for select to anon, authenticated using (published = true);

drop policy if exists "admin can read all vehicles" on public.vehicles;
create policy "admin can read all vehicles" on public.vehicles
for select to authenticated using (lower(coalesce(auth.jwt()->>'email','')) = 'sancristobalpabloignacio@gmail.com');

drop policy if exists "admin can insert vehicles" on public.vehicles;
create policy "admin can insert vehicles" on public.vehicles
for insert to authenticated with check (lower(coalesce(auth.jwt()->>'email','')) = 'sancristobalpabloignacio@gmail.com');

drop policy if exists "admin can update vehicles" on public.vehicles;
create policy "admin can update vehicles" on public.vehicles
for update to authenticated
using (lower(coalesce(auth.jwt()->>'email','')) = 'sancristobalpabloignacio@gmail.com')
with check (lower(coalesce(auth.jwt()->>'email','')) = 'sancristobalpabloignacio@gmail.com');

drop policy if exists "admin can delete vehicles" on public.vehicles;
create policy "admin can delete vehicles" on public.vehicles
for delete to authenticated using (lower(coalesce(auth.jwt()->>'email','')) = 'sancristobalpabloignacio@gmail.com');

drop policy if exists "public can insert analytics events" on public.analytics_events;
create policy "public can insert analytics events" on public.analytics_events
for insert to anon, authenticated
with check (
  event_type in ('page_view','vehicle_click','vehicle_view','whatsapp_click')
  and char_length(coalesce(source,'')) <= 80
  and char_length(coalesce(path,'')) <= 300
  and char_length(coalesce(session_id,'')) <= 120
);

drop policy if exists "admin can read analytics events" on public.analytics_events;
create policy "admin can read analytics events" on public.analytics_events
for select to authenticated using ((auth.jwt()->>'email') = 'sancristobalpabloignacio@gmail.com');

drop policy if exists "admin can delete analytics events" on public.analytics_events;
create policy "admin can delete analytics events" on public.analytics_events
for delete to authenticated using ((auth.jwt()->>'email') = 'sancristobalpabloignacio@gmail.com');

drop policy if exists "admin external listings all" on public.external_listings;
create policy "admin external listings all" on public.external_listings
for all to authenticated
using ((auth.jwt()->>'email') = 'sancristobalpabloignacio@gmail.com')
with check ((auth.jwt()->>'email') = 'sancristobalpabloignacio@gmail.com');

drop policy if exists "admin external metrics all" on public.external_metrics;
create policy "admin external metrics all" on public.external_metrics
for all to authenticated
using ((auth.jwt()->>'email') = 'sancristobalpabloignacio@gmail.com')
with check ((auth.jwt()->>'email') = 'sancristobalpabloignacio@gmail.com');

drop policy if exists "admin vehicle offers all" on public.vehicle_offers;
create policy "admin vehicle offers all" on public.vehicle_offers
for all to authenticated
using (lower(auth.jwt()->>'email') = 'sancristobalpabloignacio@gmail.com')
with check (lower(auth.jwt()->>'email') = 'sancristobalpabloignacio@gmail.com');

drop policy if exists "admin owner tracking links all" on public.owner_tracking_links;
create policy "admin owner tracking links all" on public.owner_tracking_links
for all to authenticated
using ((auth.jwt()->>'email') = 'sancristobalpabloignacio@gmail.com')
with check ((auth.jwt()->>'email') = 'sancristobalpabloignacio@gmail.com');

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('vehicle-images','vehicle-images',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "vehicle images public read" on storage.objects;
create policy "vehicle images public read" on storage.objects
for select to anon,authenticated using (bucket_id='vehicle-images');

drop policy if exists "admin can upload vehicle images" on storage.objects;
create policy "admin can upload vehicle images" on storage.objects
for insert to authenticated with check (
  bucket_id='vehicle-images'
  and lower(coalesce(auth.jwt()->>'email',''))='sancristobalpabloignacio@gmail.com'
);

drop policy if exists "admin can update vehicle images" on storage.objects;
create policy "admin can update vehicle images" on storage.objects
for update to authenticated
using (bucket_id='vehicle-images' and lower(coalesce(auth.jwt()->>'email',''))='sancristobalpabloignacio@gmail.com')
with check (bucket_id='vehicle-images' and lower(coalesce(auth.jwt()->>'email',''))='sancristobalpabloignacio@gmail.com');

drop policy if exists "admin can delete vehicle images" on storage.objects;
create policy "admin can delete vehicle images" on storage.objects
for delete to authenticated
using (bucket_id='vehicle-images' and lower(coalesce(auth.jwt()->>'email',''))='sancristobalpabloignacio@gmail.com');
