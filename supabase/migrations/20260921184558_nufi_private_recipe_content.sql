-- Prepared for the dedicated Nutrition.Fitness project only.
-- Contains no recipe content and makes no changes to public recipes or workspaces.
begin;

create table public.nufi_private_recipe_content (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  publication_status text not null default 'held' check (publication_status in ('published','held')),
  collection_id text check (collection_id in (
    'breakfast-sorted','proper-everyday-food','big-night-in','air-fryer-favourites',
    'snack-happy','blend-and-go','more-plants-please'
  )),
  payload jsonb not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  imported_at timestamptz not null default now(),
  check (jsonb_typeof(payload)='object' and
    payload ?& array['id','ingredients','steps','nutrition','sourceSha256','publicationStatus']),
  check (payload->>'id'=id),
  check (payload->>'publicationStatus'=publication_status),
  check (payload->>'sourceSha256'=source_sha256),
  check (jsonb_typeof(payload->'ingredients')='array' and jsonb_array_length(payload->'ingredients')>0),
  check (jsonb_typeof(payload->'steps')='array' and jsonb_array_length(payload->'steps')>0),
  -- Unknown or conflicted printed nutrition is preserved as JSON null.
  check (jsonb_typeof(payload->'nutrition') in ('object','null'))
);

alter table public.nufi_private_recipe_content enable row level security;
alter table public.nufi_private_recipe_content force row level security;
revoke all on public.nufi_private_recipe_content from public,anon,authenticated,service_role;
grant usage on schema public to service_role;
grant select,insert,update on public.nufi_private_recipe_content to service_role;

comment on table public.nufi_private_recipe_content is
  'Server-only recipe payloads. No browser grants or policies. The recipe API must verify account access before every read.';

-- There is deliberately no anonymous/authenticated policy and no public view/RPC.
-- The server role bypasses RLS, so authorization belongs before its protected read.
commit;
