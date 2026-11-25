-- Presence is private metadata, separate from conversation bodies.
create table public.nufi_team_presence (
 actor_id uuid primary key,
 last_seen_at timestamptz not null default now(),
 active boolean not null default true
);
alter table public.nufi_team_presence enable row level security;
revoke all on public.nufi_team_presence from public, anon, authenticated;
grant select, insert, update on public.nufi_team_presence to service_role;
create index nufi_team_presence_recent on public.nufi_team_presence (last_seen_at);
