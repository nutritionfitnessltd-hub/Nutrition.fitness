-- Reviewed, additive Dad Strong schema for the existing Nutrition.Fitness Supabase project.
-- DO NOT APPLY until event source, coach approval and GHL template mapping are tested.
-- Only service_role has API access. No public or authenticated client may select member data.
begin;

create table if not exists public.nufi_dad_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null check (char_length(email) between 4 and 254),
  first_name text not null check (char_length(first_name) between 1 and 80),
  coach_name text not null check (char_length(coach_name) between 1 and 80),
  start_date date not null check (extract(isodow from start_date)=1),
  status text not null default 'onboarding' check (status in ('onboarding','active','completed')),
  whatsapp_opt_in_at timestamptz,
  paused boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.nufi_dad_events (
  event_id uuid primary key,
  member_id uuid not null references public.nufi_dad_members(user_id) on delete cascade,
  kind text not null check (char_length(kind) between 3 and 70),
  occurred_at timestamptz not null,
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics)='object' and octet_length(metrics::text)<=1024),
  created_at timestamptz not null default now()
);
create index if not exists nufi_dad_events_member_at on public.nufi_dad_events(member_id,occurred_at desc);

create table if not exists public.nufi_dad_messages (
  id uuid primary key default gen_random_uuid(),
  dedup_key text not null unique check (char_length(dedup_key)<=200),
  member_id uuid not null references public.nufi_dad_members(user_id) on delete cascade,
  template_key text not null check (char_length(template_key)<=64),
  week smallint not null check (week between 0 and 53),
  message_preview text not null check (char_length(message_preview)<=1000),
  status text not null default 'pending' check (status in ('pending','handed_off','suppressed','failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  lease uuid,
  last_error text,
  created_at timestamptz not null default now(),
  handed_off_at timestamptz
);
create index if not exists nufi_dad_messages_pending on public.nufi_dad_messages(status,next_attempt_at);

create table if not exists public.nufi_dad_coach_tasks (
  id uuid primary key default gen_random_uuid(),
  dedup_key text not null unique check (char_length(dedup_key)<=200),
  member_id uuid not null references public.nufi_dad_members(user_id) on delete cascade,
  kind text not null check (kind in ('onboarding_review','coach_checkin_review','coach_reengagement','graduation_review')),
  week smallint not null check (week between 0 and 53),
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists nufi_dad_tasks_open on public.nufi_dad_coach_tasks(status,created_at);

alter table public.nufi_dad_members enable row level security;
alter table public.nufi_dad_events enable row level security;
alter table public.nufi_dad_messages enable row level security;
alter table public.nufi_dad_coach_tasks enable row level security;
revoke all on public.nufi_dad_members,public.nufi_dad_events,public.nufi_dad_messages,public.nufi_dad_coach_tasks from public,anon,authenticated;
grant select,insert,update,delete on public.nufi_dad_members,public.nufi_dad_events,public.nufi_dad_messages,public.nufi_dad_coach_tasks to service_role;

create or replace function public.nufi_dad_claim_message()
returns setof public.nufi_dad_messages language plpgsql security definer set search_path='' as $$
declare job public.nufi_dad_messages;
begin
 -- Privacy/consent check at send time, not merely enqueue time.
 update public.nufi_dad_messages j set status='suppressed',locked_until=null
 where j.status='pending' and exists (
   select 1 from public.nufi_dad_members m where m.user_id=j.member_id
   and (m.paused or m.whatsapp_opt_in_at is null or m.status<>'active')
 );
 select j.* into job from public.nufi_dad_messages j
 join public.nufi_dad_members m on m.user_id=j.member_id
 where j.status='pending' and j.next_attempt_at<=now()
 and (j.locked_until is null or j.locked_until<now())
 and m.status='active' and not m.paused and m.whatsapp_opt_in_at is not null
 order by j.created_at,j.id for update of j skip locked limit 1;
 if not found then return;end if;
 return query update public.nufi_dad_messages
 set locked_until=now()+interval '2 minutes',lease=gen_random_uuid(),attempts=attempts+1
 where id=job.id returning *;
end;$$;

create or replace function public.nufi_dad_finish_message(job_id uuid,claimed_lease uuid,accepted boolean,failure text)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.nufi_dad_messages j
 set status=case when accepted then 'handed_off' when j.attempts>=6 then 'failed' else 'pending' end,
 handed_off_at=case when accepted then now() else null end,
 locked_until=null,lease=null,
 last_error=case when accepted then null else left(coalesce(failure,'Webhook rejected'),200) end,
 next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(j.attempts,7)))::int)
 where j.id=job_id and j.lease=claimed_lease and j.status='pending';
 if not found then raise exception 'Dad Strong queue lease changed' using errcode='40001';end if;
end;$$;

revoke all on function public.nufi_dad_claim_message(),public.nufi_dad_finish_message(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.nufi_dad_claim_message(),public.nufi_dad_finish_message(uuid,uuid,boolean,text) to service_role;
commit;
