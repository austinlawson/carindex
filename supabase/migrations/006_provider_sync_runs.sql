create table if not exists public.provider_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  status text not null default 'completed' check (status in ('completed', 'failed')),
  month_key text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  calls_used integer not null default 0 check (calls_used >= 0),
  rows_fetched integer not null default 0 check (rows_fetched >= 0),
  listings_upserted integer not null default 0 check (listings_upserted >= 0),
  listings_archived integer not null default 0 check (listings_archived >= 0),
  listings_reactivated integer not null default 0 check (listings_reactivated >= 0),
  error text,
  notes jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists provider_sync_runs_provider_month_idx
on public.provider_sync_runs (provider, month_key, started_at desc);

alter table public.provider_sync_runs enable row level security;
