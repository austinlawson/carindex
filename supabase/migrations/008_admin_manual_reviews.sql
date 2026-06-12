create table if not exists public.admin_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now()
);

create index if not exists admin_users_granted_at_idx
on public.admin_users (granted_at desc);

alter table public.admin_users enable row level security;

drop policy if exists "admins read own admin status" on public.admin_users;
create policy "admins read own admin status"
on public.admin_users for select
using (user_id = auth.uid());
