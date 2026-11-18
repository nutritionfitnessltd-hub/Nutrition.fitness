-- Per-person capabilities are loaded on every authenticated request.
-- NULL preserves the previous access for existing team members until configured.
alter table public.nufi_library_staff
  add column access jsonb,
  add column access_revision integer not null default 1,
  add column access_updated_at timestamptz,
  add column access_updated_by uuid;

alter table public.nufi_library_staff
  add constraint nufi_library_staff_access_shape check (
    access is null or (
      jsonb_typeof(access) = 'object'
      and access - array['library','originals','studio','work','edit','ai','sources'] = '{}'::jsonb
      and not jsonb_path_exists(access, '$.* ? (@.type() != "boolean")')
    )
  ),
  add constraint nufi_library_staff_access_revision_positive check (access_revision > 0);

alter table public.nufi_library_staff enable row level security;
revoke all on public.nufi_library_staff from anon, authenticated;
-- No new client grants or RPCs: only the existing server service role can write.
