create table public.nufi_library_projects (
  id uuid primary key,
  name text not null check(length(name) between 1 and 160),
  creator_id uuid not null references public.nufi_library_staff(id),
  created_by uuid not null references auth.users(id),
  weeks integer not null check(weeks between 1 and 104),
  brief text not null default '' check(length(brief)<=4000),
  status text not null default 'Planning' check(status in ('Planning','In progress','Ready for review','Complete')),
  entries jsonb not null default '[]' check(jsonb_typeof(entries)='array'),
  revision integer not null default 1,
  created_at timestamptz not null default now()
);
create index nufi_library_projects_creator on public.nufi_library_projects(creator_id,created_at desc);
alter table public.nufi_library_projects enable row level security;
revoke all on public.nufi_library_projects from public,anon,authenticated;
grant select,insert,update on public.nufi_library_projects to service_role;
