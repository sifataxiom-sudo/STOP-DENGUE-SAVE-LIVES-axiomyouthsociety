create table if not exists public.submissions (
  kind text not null check (kind in ('audit', 'volunteer')),
  id text not null,
  data jsonb not null check (data ->> 'id' = id),
  created_at timestamptz not null default now(),
  primary key (kind, id)
);

create index if not exists submissions_kind_created_at_idx
  on public.submissions (kind, created_at desc);

alter table public.submissions enable row level security;

revoke all on table public.submissions from anon, authenticated;
grant all on table public.submissions to service_role;
