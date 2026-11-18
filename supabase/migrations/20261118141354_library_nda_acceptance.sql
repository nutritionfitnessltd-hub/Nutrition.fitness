-- Receipts are written only by the authenticated server after explicit acceptance.
create table public.nufi_library_nda_acceptances (
  id uuid primary key default gen_random_uuid(),
  actor_role text not null check (actor_role in ('admin','staff','guest')),
  actor_id text not null check (length(actor_id) between 1 and 128),
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  email text not null check (length(email) between 3 and 254),
  identity_basis text not null,
  agreement_version text not null,
  document_hash text not null check (document_hash ~ '^[a-f0-9]{64}$'),
  document_text text not null,
  accepted_at timestamptz not null default now(),
  unique (actor_role, actor_id, document_hash)
);
create index nufi_library_nda_accepted_at_idx on public.nufi_library_nda_acceptances (accepted_at desc, id desc);
alter table public.nufi_library_nda_acceptances enable row level security;
revoke all on public.nufi_library_nda_acceptances from public, anon, authenticated, service_role;
grant select, insert on public.nufi_library_nda_acceptances to service_role;
comment on table public.nufi_library_nda_acceptances is 'Private append-only NDA receipts. Guest identity is self-declared; staff/admin IDs come from authenticated sessions. No client access.';
