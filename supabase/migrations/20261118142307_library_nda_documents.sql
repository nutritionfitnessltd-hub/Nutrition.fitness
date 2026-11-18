create table public.nufi_library_nda_agreements (
  version text primary key check (version ~ '^[a-zA-Z0-9.-]{1,80}$'),
  document_text text not null check (length(document_text) between 40 and 60000),
  document_hash text not null unique check (document_hash ~ '^[a-f0-9]{64}$'),
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index nufi_library_one_active_nda on public.nufi_library_nda_agreements (active) where active;
alter table public.nufi_library_nda_agreements enable row level security;
revoke all on public.nufi_library_nda_agreements from public, anon, authenticated, service_role;
grant select on public.nufi_library_nda_agreements to service_role;
comment on table public.nufi_library_nda_agreements is 'Private agreement editions. No public or signed-in client access. Wording is not shipped in the public repository.';
