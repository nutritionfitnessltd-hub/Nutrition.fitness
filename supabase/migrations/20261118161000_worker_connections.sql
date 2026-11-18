-- Hash-only, draft-scoped machine connections. Never readable by browser roles.
create table public.nufi_worker_connections (
 id text primary key check (id ~ '^[a-z0-9-]{1,60}$'),
 token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
 namespace text not null unique check (namespace ~ '^worker:[a-z0-9-]+:$'),
 enabled boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.nufi_worker_connections enable row level security;
revoke all on public.nufi_worker_connections from public,anon,authenticated;
grant select,insert,update on public.nufi_worker_connections to service_role;
