\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('11111111-1111-4111-8111-111111111111','one@example.test',now(),'{"first_name":"One","marketing_opt_in":false}'),
 ('22222222-2222-4222-8222-222222222222','two@example.test',now(),'{"first_name":"Two","marketing_opt_in":true}');
do $$ begin
 if (select count(*) from public.nufi_crm_outbox where dedup_key like 'account:%')<>2 then raise exception 'Verified account queue missing';end if;
 if has_function_privilege('authenticated','public.nufi_activate_trial(uuid)','EXECUTE') then raise exception 'Trial RPC publicly executable';end if;
 if has_function_privilege('anon','public.nufi_reserve(uuid,text,jsonb)','EXECUTE') then raise exception 'Reservation RPC publicly executable';end if;
 if has_function_privilege('authenticated','public.nufi_admin_workspaces()','EXECUTE') then raise exception 'Admin RPC publicly executable';end if;
 if has_table_privilege('authenticated','public.nufi_reservations','SELECT') then raise exception 'Reservations exposed';end if;
 if has_table_privilege('anon','public.nufi_workspaces','SELECT') then raise exception 'Anonymous workspace exposure';end if;
 if has_table_privilege('authenticated','public.nufi_workspaces','UPDATE') then raise exception 'Direct mutation bypasses validation';end if;
end $$;
select public.nufi_save_workspace('11111111-1111-4111-8111-111111111111',0,'{"schema":1,"revision":1,"onboarding":{"targets":{"protein":150}},"logs":[{"test":"immutable"}]}'::jsonb);
select public.nufi_save_workspace('22222222-2222-4222-8222-222222222222',0,'{"schema":1,"revision":1,"onboarding":null,"logs":[]}'::jsonb);
do $$ begin
 begin
 perform public.nufi_save_workspace('11111111-1111-4111-8111-111111111111',0,'{"schema":1}'::jsonb);
 raise exception 'Stale version accepted';
 exception when serialization_failure then null;end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
 if (select count(*) from public.nufi_workspaces)<>1 then raise exception 'RLS did not isolate account';end if;
 if not exists(select 1 from public.nufi_workspaces where user_id='11111111-1111-4111-8111-111111111111') then raise exception 'Own account read blocked';end if;
 if exists(select 1 from public.nufi_workspaces where user_id='22222222-2222-4222-8222-222222222222') then raise exception 'Other account leaked';end if;
end $$;
reset role;
select public.nufi_reserve('33333333-3333-4333-8333-333333333333',' ONE@example.test ','{"kind":"quiz","submittedAt":"2026-09-16T09:00:00Z","recommendation":{"name":"core.arms"},"marketing":{"requested":false}}');
select public.nufi_reserve('33333333-3333-4333-8333-333333333333','one@example.test','{"kind":"quiz","submittedAt":"2026-09-16T09:01:00Z","recommendation":{"name":"core.arms"},"marketing":{"requested":false}}');
do $$ begin
 if (select count(*) from public.nufi_submissions)<>1 then raise exception 'Reservation idempotence failed';end if;
 if (select count(*) from public.nufi_crm_outbox where dedup_key='quiz:33333333-3333-4333-8333-333333333333')<>1 then raise exception 'Duplicate reservation outbox event';end if;
 begin
 perform public.nufi_reserve('33333333-3333-4333-8333-333333333333','one@example.test','{"kind":"quiz","recommendation":{"name":"build"}}');
 raise exception 'Changed request replay accepted';
 exception when serialization_failure then null;end;
 if (public.nufi_trial_status('11111111-1111-4111-8111-111111111111')->>'eligible')::boolean is not true then raise exception 'Reserved member not eligible';end if;
 if now()<'2026-11-01T09:00:00Z'::timestamptz then
  begin
   perform public.nufi_activate_trial('11111111-1111-4111-8111-111111111111');
   raise exception 'Activated before launch';
  exception when others then if sqlerrm<>'Launch not open' then raise;end if;end;
 else
  perform public.nufi_activate_trial('11111111-1111-4111-8111-111111111111');
  perform public.nufi_activate_trial('11111111-1111-4111-8111-111111111111');
  if (select count(*) from public.nufi_entitlements where user_id='11111111-1111-4111-8111-111111111111')<>1 then raise exception 'Duplicate activation';end if;
 end if;
 if ('2027-01-31 12:15:00'::timestamp+interval '1 month')<>'2027-02-28 12:15:00'::timestamp then raise exception 'Calendar month clamping failed';end if;
end $$;
-- A queue job is exclusive while its lease is active, and another email can proceed.
do $$ declare first_job public.nufi_crm_outbox;second_job public.nufi_crm_outbox;begin
 select * into first_job from public.nufi_claim_crm();
 select * into second_job from public.nufi_claim_crm();
 if first_job.id is null or second_job.id is null then raise exception 'Queue job not claimed';end if;
 if first_job.id=second_job.id or first_job.email=second_job.email then raise exception 'Lease/email ordering failure';end if;
 perform public.nufi_finish_crm(first_job.id,first_job.lease,true,null);
 perform public.nufi_finish_crm(second_job.id,second_job.lease,false,'Test retry');
 if (select status from public.nufi_crm_outbox where id=first_job.id)<>'sent' then raise exception 'Sent job not saved';end if;
 if (select next_attempt_at from public.nufi_crm_outbox where id=second_job.id)<=now() then raise exception 'Retry not delayed';end if;
 begin
 perform public.nufi_finish_crm(first_job.id,'ffffffff-ffff-4fff-8fff-ffffffffffff',true,null);
 raise exception 'Wrong lease accepted';
 exception when serialization_failure then null;end;
end $$;
select public.nufi_reset_onboarding('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',1);
do $$ begin
 if (select state->'onboarding' from public.nufi_workspaces where user_id='11111111-1111-4111-8111-111111111111')<>'null'::jsonb then raise exception 'Onboarding not reset';end if;
 if (select state->'logs' from public.nufi_workspaces where user_id='11111111-1111-4111-8111-111111111111')<>'[{"test":"immutable"}]'::jsonb then raise exception 'Admin reset rewrote food log';end if;
 if (select count(*) from public.nufi_admin_audit)<>1 then raise exception 'Missing admin audit';end if;
end $$;
-- Expiry event is queued once even when the worker repeats.
insert into public.nufi_entitlements(user_id,email,activated_at,expires_at) values('22222222-2222-4222-8222-222222222222','two@example.test',now()-interval '2 months',now()-interval '1 month');
select public.nufi_expire_trials();select public.nufi_expire_trials();
do $$ begin
 if (select count(*) from public.nufi_crm_outbox where dedup_key='expiry:22222222-2222-4222-8222-222222222222')<>1 then raise exception 'Duplicate expiry events';end if;
end $$;
rollback;
select 'PASS: SQL migration, RLS, CAS, reservation idempotence, queue leases, launch guard, admin audit and expiry' as result;
