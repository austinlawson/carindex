create extension if not exists pgcrypto;

do $$ begin
  create type seller_type as enum ('Private Seller', 'Dealer', 'Small Lot');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type listing_source_mode as enum ('user', 'marketcheck', 'ebay', 'csv', 'mock');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type listing_status as enum ('draft', 'active', 'sold', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type listing_media_type as enum ('image', 'video');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type deal_grade as enum ('A', 'A-', 'B+', 'B', 'C', 'Pass');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type risk_level as enum ('Low', 'Medium', 'High');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type offer_payment_type as enum ('Cash', 'Financing', 'Trade');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type offer_status as enum ('sent', 'accepted', 'declined', 'countered', 'counter-accepted');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Driver',
  seller_type seller_type not null default 'Private Seller',
  location text,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  source_mode listing_source_mode not null default 'user',
  source_name text,
  source_url text,
  external_listing_url text,
  provider_listing_id text,
  status listing_status not null default 'active',
  year integer not null check (year between 1900 and 2100),
  make text not null,
  model text not null,
  trim text not null default '',
  price integer not null check (price >= 0),
  mileage integer not null check (mileage >= 0),
  location text not null,
  distance numeric not null default 0,
  seller_type seller_type not null default 'Private Seller',
  seller_name text,
  seller_phone text,
  seller_email text,
  contact_url text,
  vin text,
  listing_title text,
  listing_description text,
  deal_grade deal_grade not null default 'B',
  feed_badge text not null default 'Fresh Upload',
  ai_hook text not null default '',
  ai_take text not null default '',
  fair_value_low integer not null default 0,
  fair_value_high integer not null default 0,
  market_edge text not null default 'Needs market check',
  confidence integer not null default 50 check (confidence between 0 and 100),
  risk_level risk_level not null default 'Medium',
  why_it_made_the_feed text not null default '',
  red_flags text[] not null default '{}',
  seller_questions text[] not null default '{}',
  suggested_first_message text not null default '',
  suggested_offer integer not null default 0,
  walkaway_price integer not null default 0,
  checklist_items text[] not null default '{}',
  tags text[] not null default '{}',
  reel_captions text[] not null default '{}',
  raw_provider_summary jsonb,
  imported_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_listings_have_owner check (source_mode <> 'user' or owner_id is not null)
);

create table if not exists public.listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  media_type listing_media_type not null,
  storage_path text,
  public_url text not null,
  thumbnail_url text,
  sort_order integer not null default 0,
  label text,
  width integer,
  height integer,
  duration_seconds numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_listings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid references public.profiles(id) on delete set null,
  asking_price integer not null check (asking_price >= 0),
  offer_amount integer not null check (offer_amount > 0),
  counter_amount integer check (counter_amount is null or counter_amount > 0),
  payment_type offer_payment_type not null default 'Cash',
  message text not null default '',
  status offer_status not null default 'sent',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offer_events (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  amount integer,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete set null,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.listing_imports (
  id uuid primary key default gen_random_uuid(),
  source_mode listing_source_mode not null check (source_mode in ('marketcheck', 'ebay', 'csv')),
  source_listing_id text not null,
  listing_id uuid references public.listings(id) on delete set null,
  payload jsonb not null,
  imported_at timestamptz not null default now(),
  unique (source_mode, source_listing_id)
);

create index if not exists listings_feed_idx on public.listings (status, source_mode, created_at desc);
create index if not exists listings_owner_idx on public.listings (owner_id, created_at desc);
create index if not exists listing_media_listing_idx on public.listing_media (listing_id, sort_order);
create index if not exists offers_listing_idx on public.offers (listing_id, created_at desc);
create index if not exists offers_buyer_idx on public.offers (buyer_id, created_at desc);
create index if not exists offers_seller_idx on public.offers (seller_id, created_at desc);
create index if not exists messages_listing_idx on public.messages (listing_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists listings_set_updated_at on public.listings;
create trigger listings_set_updated_at
before update on public.listings
for each row execute function public.set_updated_at();

drop trigger if exists offers_set_updated_at on public.offers;
create trigger offers_set_updated_at
before update on public.offers
for each row execute function public.set_updated_at();

create or replace function public.set_offer_seller_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select owner_id into new.seller_id
  from public.listings
  where id = new.listing_id;

  return new;
end;
$$;

drop trigger if exists offers_set_seller_id on public.offers;
create trigger offers_set_seller_id
before insert on public.offers
for each row execute function public.set_offer_seller_id();

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_media enable row level security;
alter table public.saved_listings enable row level security;
alter table public.offers enable row level security;
alter table public.offer_events enable row level security;
alter table public.messages enable row level security;
alter table public.listing_imports enable row level security;

drop policy if exists "profiles are readable" on public.profiles;
create policy "profiles are readable"
on public.profiles for select
using (true);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
on public.profiles for insert
with check (auth.uid() = id);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "active listings are readable" on public.listings;
create policy "active listings are readable"
on public.listings for select
using (status = 'active' or owner_id = auth.uid());

drop policy if exists "users insert own listings" on public.listings;
create policy "users insert own listings"
on public.listings for insert
with check (owner_id = auth.uid() and source_mode = 'user');

drop policy if exists "users update own listings" on public.listings;
create policy "users update own listings"
on public.listings for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "users delete own listings" on public.listings;
create policy "users delete own listings"
on public.listings for delete
using (owner_id = auth.uid());

drop policy if exists "listing media is readable" on public.listing_media;
create policy "listing media is readable"
on public.listing_media for select
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_media.listing_id
      and (listings.status = 'active' or listings.owner_id = auth.uid())
  )
);

drop policy if exists "users insert own listing media" on public.listing_media;
create policy "users insert own listing media"
on public.listing_media for insert
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.listings
    where listings.id = listing_media.listing_id
      and listings.owner_id = auth.uid()
  )
);

drop policy if exists "users update own listing media" on public.listing_media;
create policy "users update own listing media"
on public.listing_media for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "users delete own listing media" on public.listing_media;
create policy "users delete own listing media"
on public.listing_media for delete
using (owner_id = auth.uid());

drop policy if exists "users read own saves" on public.saved_listings;
create policy "users read own saves"
on public.saved_listings for select
using (user_id = auth.uid());

drop policy if exists "users save listings" on public.saved_listings;
create policy "users save listings"
on public.saved_listings for insert
with check (user_id = auth.uid());

drop policy if exists "users unsave listings" on public.saved_listings;
create policy "users unsave listings"
on public.saved_listings for delete
using (user_id = auth.uid());

drop policy if exists "buyers and sellers read offers" on public.offers;
create policy "buyers and sellers read offers"
on public.offers for select
using (buyer_id = auth.uid() or seller_id = auth.uid());

drop policy if exists "buyers make private seller offers" on public.offers;
create policy "buyers make private seller offers"
on public.offers for insert
with check (
  buyer_id = auth.uid()
  and exists (
    select 1 from public.listings
    where listings.id = offers.listing_id
      and listings.source_mode = 'user'
      and listings.seller_type = 'Private Seller'
      and listings.owner_id is not null
      and listings.owner_id <> auth.uid()
  )
);

drop policy if exists "buyers and sellers update offers" on public.offers;
create policy "buyers and sellers update offers"
on public.offers for update
using (buyer_id = auth.uid() or seller_id = auth.uid())
with check (buyer_id = auth.uid() or seller_id = auth.uid());

drop policy if exists "buyers and sellers read offer events" on public.offer_events;
create policy "buyers and sellers read offer events"
on public.offer_events for select
using (
  exists (
    select 1 from public.offers
    where offers.id = offer_events.offer_id
      and (offers.buyer_id = auth.uid() or offers.seller_id = auth.uid())
  )
);

drop policy if exists "buyers and sellers create offer events" on public.offer_events;
create policy "buyers and sellers create offer events"
on public.offer_events for insert
with check (
  exists (
    select 1 from public.offers
    where offers.id = offer_events.offer_id
      and (offers.buyer_id = auth.uid() or offers.seller_id = auth.uid())
  )
);

drop policy if exists "participants read messages" on public.messages;
create policy "participants read messages"
on public.messages for select
using (sender_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "participants create messages" on public.messages;
create policy "participants create messages"
on public.messages for insert
with check (sender_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-media',
  'listing-media',
  true,
  104857600,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "listing media files are public" on storage.objects;
create policy "listing media files are public"
on storage.objects for select
using (bucket_id = 'listing-media');

drop policy if exists "users upload listing media files" on storage.objects;
create policy "users upload listing media files"
on storage.objects for insert
with check (
  bucket_id = 'listing-media'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "users update own listing media files" on storage.objects;
create policy "users update own listing media files"
on storage.objects for update
using (
  bucket_id = 'listing-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'listing-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "users delete own listing media files" on storage.objects;
create policy "users delete own listing media files"
on storage.objects for delete
using (
  bucket_id = 'listing-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

