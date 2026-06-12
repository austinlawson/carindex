create table if not exists public.listing_interest_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  anonymous_id text,
  listing_id uuid not null references public.listings(id) on delete cascade,
  event_type text not null,
  event_weight numeric not null default 0,
  dwell_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  listing_snapshot jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint listing_interest_actor_present check (user_id is not null or anonymous_id is not null),
  constraint listing_interest_event_type_check check (
    event_type in (
      'view',
      'dwell',
      'long_view',
      'revisit',
      'scroll_back',
      'save',
      'share',
      'ai_open',
      'gallery_open',
      'description_open',
      'offer_open',
      'contact_open'
    )
  )
);

create index if not exists listing_interest_events_listing_idx
on public.listing_interest_events (listing_id, occurred_at desc);

create index if not exists listing_interest_events_user_idx
on public.listing_interest_events (user_id, occurred_at desc)
where user_id is not null;

create index if not exists listing_interest_events_anonymous_idx
on public.listing_interest_events (anonymous_id, occurred_at desc)
where anonymous_id is not null;

create index if not exists listing_interest_events_type_idx
on public.listing_interest_events (event_type, occurred_at desc);

alter table public.listing_interest_events enable row level security;

drop policy if exists "users read own listing interest events" on public.listing_interest_events;
create policy "users read own listing interest events"
on public.listing_interest_events for select
using (user_id = auth.uid());
