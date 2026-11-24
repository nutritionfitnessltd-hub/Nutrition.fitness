create table public.nufi_team_welcome_acknowledgements (
 id uuid primary key default gen_random_uuid(),
 actor_id text not null,
 full_name text not null,
 letter_version text not null,
 document_hash text not null check (document_hash ~ '^[a-f0-9]{64}$'),
 document_text text not null,
 profile_snapshot jsonb not null,
 acknowledged_at timestamptz not null default now(),
 unique(actor_id,document_hash)
);
alter table public.nufi_team_welcome_acknowledgements enable row level security;
revoke all on public.nufi_team_welcome_acknowledgements from public,anon,authenticated,service_role;
grant select,insert on public.nufi_team_welcome_acknowledgements to service_role;
