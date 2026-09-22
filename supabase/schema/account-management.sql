-- Nutrition.Fitness account management schema.
-- Apply to the existing Nutrition.Fitness Supabase project after the original
-- nufi_launch and recipe schemas, then validate before enabling readiness flags.
-- This is a reviewed schema source, not an automatically applied migration.
begin;

create table if not exists public.nufi_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '' check (char_length(first_name) <= 80),
  role text not null default 'member' check (role in ('member','admin')),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.nufi_members enable row level security;
revoke all on public.nufi_members from public, anon, authenticated;
grant select, insert, update, delete on public.nufi_members to service_role;
create index if not exists nufi_members_status_role on public.nufi_members(status,role);

-- Membership permissions are never copied from user-editable auth metadata.
-- Names are display content only. Existing account roles are never overwritten.
insert into public.nufi_members(user_id,first_name)
select id, left(regexp_replace(coalesce(raw_user_meta_data->>'first_name',''),'[<>[:cntrl:]]','','g'),80)
from auth.users where email_confirmed_at is not null and is_anonymous is not true
on conflict(user_id) do nothing;

create table if not exists public.nufi_password_recoveries (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  access_ciphertext text not null check (octet_length(access_ciphertext) between 40 and 10000),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '11 minutes')
);
alter table public.nufi_password_recoveries enable row level security;
revoke all on public.nufi_password_recoveries from public, anon, authenticated;
grant select, insert, delete on public.nufi_password_recoveries to service_role;
create index if not exists nufi_password_recoveries_expiry on public.nufi_password_recoveries(expires_at);
create index if not exists nufi_password_recoveries_user on public.nufi_password_recoveries(user_id);
comment on table public.nufi_password_recoveries is 'Ten-minute, single-use recovery grants. Opaque cookie token is hashed; provider access is AES-256-GCM encrypted with server-only NUFI_RECOVERY_ENCRYPTION_KEY.';

-- Bootstrap the first administrator explicitly after verifying their email.
-- Existing rows are authoritative: NUFI_ADMIN_USER_IDS never overrides a
-- protected member row after demotion. Do not derive roles from auth metadata.
-- Example (replace the verified user UUID before applying):
-- update public.nufi_members set role='admin', updated_at=now()
-- where user_id='VERIFIED-ADMIN-UUID';

commit;
