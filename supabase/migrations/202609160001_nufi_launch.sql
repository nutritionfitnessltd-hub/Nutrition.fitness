begin;
create table public.nufi_workspaces(user_id uuid primary key references auth.users(id) on delete cascade,state jsonb not null check(jsonb_typeof(state)='object'),version bigint not null default 1,updated_at timestamptz not null default now());
create table public.nufi_submissions(request_id uuid primary key,email text not null,record jsonb not null,created_at timestamptz not null default now());
create table public.nufi_reservations(email text primary key,record jsonb not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.nufi_entitlements(user_id uuid not null references auth.users(id) on delete cascade,email text not null,offer text not null default 'nufi-launch-2026-12-v1',activated_at timestamptz not null,expires_at timestamptz not null,expired_event_at timestamptz,primary key(user_id,offer),unique(email,offer),check(expires_at>activated_at));
create table public.nufi_crm_outbox(id uuid primary key default gen_random_uuid(),dedup_key text not null unique,email text not null,payload jsonb not null,status text not null default 'pending' check(status in ('pending','sent')),attempts int not null default 0,next_attempt_at timestamptz not null default now(),locked_until timestamptz,lease uuid,last_error text,created_at timestamptz not null default now(),sent_at timestamptz);
create index nufi_outbox_pending on public.nufi_crm_outbox(status,next_attempt_at);
create table public.nufi_admin_audit(id bigint generated always as identity primary key,actor uuid not null,target uuid,action text not null,at timestamptz not null default now());
alter table public.nufi_workspaces enable row level security;
alter table public.nufi_submissions enable row level security;
alter table public.nufi_reservations enable row level security;
alter table public.nufi_entitlements enable row level security;
alter table public.nufi_crm_outbox enable row level security;
alter table public.nufi_admin_audit enable row level security;
revoke all on public.nufi_workspaces,public.nufi_submissions,public.nufi_reservations,public.nufi_entitlements,public.nufi_crm_outbox,public.nufi_admin_audit from anon,authenticated;
grant select on public.nufi_workspaces to authenticated;
create policy own_workspace_read on public.nufi_workspaces for select to authenticated using ((select auth.uid())=user_id);
grant all on public.nufi_workspaces,public.nufi_submissions,public.nufi_reservations,public.nufi_entitlements,public.nufi_crm_outbox,public.nufi_admin_audit to service_role;
grant usage,select on sequence public.nufi_admin_audit_id_seq to service_role;

create function public.nufi_save_workspace(actor uuid,expected_version bigint,next_state jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_version bigint;new_version bigint;
begin
 if actor is null or expected_version<0 or jsonb_typeof(next_state)<>'object' or (next_state->>'schema')<>'1' or octet_length(next_state::text)>2000000 then raise exception 'Invalid workspace';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select version into current_version from public.nufi_workspaces where user_id=actor for update;
 current_version:=coalesce(current_version,0);if current_version<>expected_version then raise exception 'Workspace changed' using errcode='40001';end if;
 new_version:=current_version+1;
 insert into public.nufi_workspaces(user_id,state,version) values(actor,next_state,new_version) on conflict(user_id) do update set state=excluded.state,version=excluded.version,updated_at=now();
 return jsonb_build_object('version',new_version);
end;$$;

create function public.nufi_reserve(request_id uuid,address text,record jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.nufi_submissions;clean text:=lower(trim(address));
begin
 if length(clean)>254 or position('@' in clean)<2 or record->>'kind'<>'quiz' then raise exception 'Invalid reservation';end if;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,1));
 select * into existing from public.nufi_submissions s where s.request_id=nufi_reserve.request_id;
 if found then
  if existing.email<>clean or (existing.record-'submittedAt')<>(record-'submittedAt') then raise exception 'Request identifier already used' using errcode='40001';end if;
  return jsonb_build_object('status','reserved','replayed',true);
 end if;
 insert into public.nufi_submissions values(request_id,clean,record,now());
 insert into public.nufi_reservations(email,record) values(clean,record) on conflict(email) do update set record=excluded.record,updated_at=now();
 insert into public.nufi_crm_outbox(dedup_key,email,payload) values('quiz:'||request_id::text,clean,record);
 return jsonb_build_object('status','reserved');
end;$$;

create function public.nufi_claim_crm() returns setof public.nufi_crm_outbox language plpgsql security definer set search_path='' as $$
declare item public.nufi_crm_outbox;
begin
 select j.* into item from public.nufi_crm_outbox j where j.status='pending' and j.next_attempt_at<=now() and (j.locked_until is null or j.locked_until<now())
 and not exists(select 1 from public.nufi_crm_outbox prior where prior.email=j.email and prior.status='pending' and (prior.created_at,prior.id)<(j.created_at,j.id))
 order by j.created_at,j.id for update of j skip locked limit 1;
 if not found then return;end if;
 return query update public.nufi_crm_outbox set locked_until=now()+interval '2 minutes',lease=gen_random_uuid(),attempts=attempts+1 where id=item.id returning *;
end;$$;
create function public.nufi_finish_crm(job_id uuid,lease uuid,ok boolean,failure text) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.nufi_crm_outbox j set status=case when ok then 'sent' else 'pending' end,sent_at=case when ok then now() else null end,locked_until=null,last_error=case when ok then null else left(failure,200) end,next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(j.attempts,7)))::int) where j.id=job_id and j.lease=nufi_finish_crm.lease;
 if not found then raise exception 'CRM lease changed' using errcode='40001';end if;
end;$$;

create function public.nufi_trial_status(actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u auth.users;e public.nufi_entitlements;eligible boolean;
begin
 select * into u from auth.users where id=actor and email_confirmed_at is not null;if not found then raise exception 'Verified account required';end if;
 select * into e from public.nufi_entitlements where user_id=actor and offer='nufi-launch-2026-12-v1';
 select exists(select 1 from public.nufi_reservations r where r.email=lower(u.email)) into eligible;
 return jsonb_build_object('eligible',eligible,'entitlement',case when e.user_id is null then null else jsonb_build_object('status',case when e.expires_at>now() then 'active' else 'expired' end,'activated_at',e.activated_at,'expires_at',e.expires_at) end);
end;$$;
create function public.nufi_activate_trial(actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u auth.users;e public.nufi_entitlements;start_time timestamptz:=now();finish_time timestamptz;
begin
 if start_time<'2026-12-01 09:00:00+00'::timestamptz then raise exception 'Launch not open';end if;
 select * into u from auth.users where id=actor and email_confirmed_at is not null;if not found then raise exception 'Verified account required';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(u.email),2));
 select * into e from public.nufi_entitlements where user_id=actor and offer='nufi-launch-2026-12-v1';
 if found then return jsonb_build_object('activated_at',e.activated_at,'expires_at',e.expires_at);end if;
 if not exists(select 1 from public.nufi_reservations where email=lower(u.email)) then raise exception 'Complete the programme finder first';end if;
 if exists(select 1 from public.nufi_entitlements where email=lower(u.email) and offer='nufi-launch-2026-12-v1') then raise exception 'This email has already used its free month';end if;
 finish_time:=((start_time at time zone 'UTC')+interval '1 month') at time zone 'UTC';
 insert into public.nufi_entitlements(user_id,email,activated_at,expires_at) values(actor,lower(u.email),start_time,finish_time);
 insert into public.nufi_crm_outbox(dedup_key,email,payload) values('activation:'||actor::text,lower(u.email),jsonb_build_object('kind','activation','activatedAt',start_time,'expiresAt',finish_time,'offerVersion','nufi-launch-2026-12-v1')) on conflict(dedup_key) do nothing;
 return jsonb_build_object('activated_at',start_time,'expires_at',finish_time);
end;$$;
create function public.nufi_expire_trials() returns int language plpgsql security definer set search_path='' as $$
declare e public.nufi_entitlements;counted int:=0;
begin
 for e in select * from public.nufi_entitlements where expires_at<=now() and expired_event_at is null for update skip locked limit 100 loop
  insert into public.nufi_crm_outbox(dedup_key,email,payload) values('expiry:'||e.user_id::text,e.email,jsonb_build_object('kind','expiry','activatedAt',e.activated_at,'expiresAt',e.expires_at,'offerVersion',e.offer)) on conflict(dedup_key) do nothing;
  update public.nufi_entitlements set expired_event_at=now() where user_id=e.user_id and offer=e.offer;counted:=counted+1;
 end loop;return counted;
end;$$;

create function public.nufi_verified_signup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.email_confirmed_at is not null and (TG_OP='INSERT' or old.email_confirmed_at is null) then
 insert into public.nufi_crm_outbox(dedup_key,email,payload) values('account:'||new.id::text,lower(new.email),jsonb_build_object('kind','account','firstName',left(coalesce(new.raw_user_meta_data->>'first_name',''),80),'signupSource','website-account','verifiedAt',new.email_confirmed_at,'marketing',jsonb_build_object('requested',coalesce(new.raw_user_meta_data->>'marketing_opt_in','false')='true','version','email-optin-v1','wording','Yes, send me useful Nutrition.Fitness tips, news and offers by email.'))) on conflict(dedup_key) do nothing;
 end if;return new;
end;$$;
create trigger nufi_verified_signup after insert or update of email_confirmed_at on auth.users for each row execute function public.nufi_verified_signup();

create function public.nufi_reset_onboarding(admin_actor uuid,target uuid,expected_version bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_state jsonb;new_version bigint;
begin
 select state into current_state from public.nufi_workspaces where user_id=target and version=expected_version for update;if not found then raise exception 'Workspace changed' using errcode='40001';end if;
 current_state:=jsonb_set(current_state,'{onboarding}','null'::jsonb);current_state:=jsonb_set(current_state,'{revision}',to_jsonb(coalesce((current_state->>'revision')::bigint,0)+1));
 update public.nufi_workspaces set state=current_state,version=version+1,updated_at=now() where user_id=target returning version into new_version;
 insert into public.nufi_admin_audit(actor,target,action) values(admin_actor,target,'Rerun onboarding requested; food logs and recipes retained.');
 return jsonb_build_object('version',new_version);
end;$$;

create function public.nufi_admin_workspaces() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('userId',w.user_id,'email',u.email,'onboarding',w.state->'onboarding','version',w.version,'updatedAt',w.updated_at)),'[]'::jsonb) from (select * from public.nufi_workspaces order by updated_at desc limit 100) w join auth.users u on u.id=w.user_id;
$$;
revoke all on function public.nufi_admin_workspaces() from public,anon,authenticated;
grant execute on function public.nufi_admin_workspaces() to service_role;

revoke all on function public.nufi_save_workspace(uuid,bigint,jsonb),public.nufi_reserve(uuid,text,jsonb),public.nufi_claim_crm(),public.nufi_finish_crm(uuid,uuid,boolean,text),public.nufi_trial_status(uuid),public.nufi_activate_trial(uuid),public.nufi_expire_trials(),public.nufi_reset_onboarding(uuid,uuid,bigint),public.nufi_verified_signup() from public,anon,authenticated;
grant execute on function public.nufi_save_workspace(uuid,bigint,jsonb),public.nufi_reserve(uuid,text,jsonb),public.nufi_claim_crm(),public.nufi_finish_crm(uuid,uuid,boolean,text),public.nufi_trial_status(uuid),public.nufi_activate_trial(uuid),public.nufi_expire_trials(),public.nufi_reset_onboarding(uuid,uuid,bigint) to service_role;
commit;
