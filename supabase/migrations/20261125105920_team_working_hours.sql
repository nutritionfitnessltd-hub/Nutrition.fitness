create table public.nufi_team_working_hours (
 actor_id uuid primary key,
 time_zone text not null,
 days jsonb not null check (jsonb_typeof(days)='array' and jsonb_array_length(days)=7),
 revision integer not null default 1 check (revision>0)
);
alter table public.nufi_team_working_hours enable row level security;
revoke all on public.nufi_team_working_hours from public, anon, authenticated;
grant select, insert, update on public.nufi_team_working_hours to service_role;
