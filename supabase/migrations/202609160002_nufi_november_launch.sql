-- Launch moved to 1 November 2026, 09:00 UK (09:00 UTC).
-- Only the activation guard changes. Preserve reservations, grants, expiry dates,
-- and the original offer identifier so no second free month is created.
begin;
create or replace function public.nufi_activate_trial(actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u auth.users;e public.nufi_entitlements;start_time timestamptz:=now();finish_time timestamptz;
begin
 if start_time<'2026-11-01 09:00:00+00'::timestamptz then raise exception 'Launch not open';end if;
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
revoke all on function public.nufi_activate_trial(uuid) from public,anon,authenticated;
grant execute on function public.nufi_activate_trial(uuid) to service_role;
commit;
