-- Human conversations are deliberately outside the Studio/AI content catalogue.
create table public.nufi_team_threads (
 id uuid primary key,
 member_ids uuid[] not null default '{}',
 payload jsonb not null check (jsonb_typeof(payload) = 'object'),
 summary jsonb not null default '{}' check (jsonb_typeof(summary) = 'object'),
 revision integer not null default 1 check (revision > 0),
 updated_at timestamptz not null default now(),
 check (octet_length(payload::text) <= 16777216)
);
create index nufi_team_threads_members on public.nufi_team_threads using gin(member_ids);
create index nufi_team_threads_recent on public.nufi_team_threads(updated_at desc,id);
alter table public.nufi_team_threads enable row level security;
revoke all on public.nufi_team_threads from public,anon,authenticated,service_role;
grant select,insert,update on public.nufi_team_threads to service_role;
-- No browser policy: the existing verified Team session and membership checks
-- authorise every read/write/download on the server. No hard-delete grant.
