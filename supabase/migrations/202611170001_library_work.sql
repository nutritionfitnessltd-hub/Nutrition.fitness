create table public.nufi_library_display (
  id text primary key,
  payload jsonb not null
);

create table public.nufi_library_staff (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 100),
  email text not null unique check (email = lower(email) and length(email) between 3 and 254),
  code_hash text check (code_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

create table public.nufi_library_tasks (
  id uuid primary key,
  staff_id uuid not null references public.nufi_library_staff(id),
  record_id text not null,
  record_title text not null,
  title text not null check (length(title) between 1 and 160),
  instructions text not null default '' check (length(instructions) <= 3000),
  due_date date,
  status text not null default 'To do' check (status in ('To do','In progress','Ready for review','Done')),
  revision integer not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index nufi_library_tasks_staff_idx on public.nufi_library_tasks(staff_id,due_date,created_at);
alter table public.nufi_library_display enable row level security;
alter table public.nufi_library_staff enable row level security;
alter table public.nufi_library_tasks enable row level security;
revoke all on public.nufi_library_display, public.nufi_library_staff, public.nufi_library_tasks from public, anon, authenticated;
grant select on public.nufi_library_display to service_role;
grant select,insert,update on public.nufi_library_staff,public.nufi_library_tasks to service_role;
