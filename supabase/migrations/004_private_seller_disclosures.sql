do $$ begin
  create type seller_title_status as enum (
    'not_disclosed',
    'paid_off_title_in_hand',
    'paid_off_title_pending',
    'financed_lien',
    'lease_payoff',
    'not_sure'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type vehicle_condition_status as enum (
    'not_disclosed',
    'excellent',
    'good',
    'runs_with_issues',
    'needs_repair',
    'mechanic_special',
    'project_non_running'
  );
exception when duplicate_object then null;
end $$;

alter table public.listings
  add column if not exists seller_title_status seller_title_status not null default 'not_disclosed',
  add column if not exists vehicle_condition vehicle_condition_status not null default 'not_disclosed',
  add column if not exists known_issue_flags text[] not null default '{}',
  add column if not exists seller_disclosure_notes text;
