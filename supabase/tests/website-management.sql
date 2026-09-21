-- Disposable integration database only; never run fixtures on a hosted project.
-- Runs real service/anon/authenticated grants, RPCs and transaction failures.
begin;

insert into auth.users(id,email,email_confirmed_at) values
 ('71111111-1111-4111-8111-111111111111','cms-admin-one@example.test',now()),
 ('72222222-2222-4222-8222-222222222222','cms-admin-two@example.test',now()),
 ('73333333-3333-4333-8333-333333333333','cms-member@example.test',now()),
 ('74444444-4444-4444-8444-444444444444','cms-no-planner@example.test',now());
insert into public.nufi_members(user_id,first_name,role) values
 ('71111111-1111-4111-8111-111111111111','First admin','admin'),
 ('72222222-2222-4222-8222-222222222222','Second admin','admin'),
 ('73333333-3333-4333-8333-333333333333','Member','member');
insert into public.nufi_private_recipe_content(id,payload,source_sha256,content_sha256)
values('cms-private-recipe',jsonb_build_object('id','cms-private-recipe','name','Original private recipe','publicationStatus','held',
 'ingredients',jsonb_build_array(jsonb_build_object('name','Source ingredient')),
 'steps',jsonb_build_array('Source method'),'nutrition',null,'sourceSha256',repeat('c',64)),repeat('c',64),repeat('d',64));

do $$ declare actor text; relation text; permission text; signature text; begin
 foreach relation in array array['nufi_content','nufi_management_audit'] loop
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid=('public.'||relation)::regclass) then
   raise exception 'Server-only table % must force RLS',relation;
  end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename=relation) then
   raise exception 'Browser policy exposes %',relation;
  end if;
  foreach actor in array array['anon','authenticated'] loop
   foreach permission in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    if has_table_privilege(actor,'public.'||relation,permission) then
     raise exception 'Unexpected % grant for % on %',permission,actor,relation;
    end if;
   end loop;
  end loop;
 end loop;
 foreach signature in array array[
  'public.nufi_manage_save_content(uuid,text,text,bigint,jsonb)',
  'public.nufi_manage_update_member(uuid,uuid,timestamptz,text,text,text,boolean)',
  'public.nufi_manage_members(text,int,int)','public.nufi_manage_audit(text,int,int)',
  'public.nufi_manage_overview()'] loop
  foreach actor in array array['anon','authenticated'] loop
   if has_function_privilege(actor,signature,'EXECUTE') then
    raise exception 'Server RPC % is executable by %',signature,actor;
   end if;
  end loop;
  if not has_function_privilege('service_role',signature,'EXECUTE') then
   raise exception 'Server role cannot execute %',signature;
  end if;
  if (select prosecdef from pg_proc where oid=signature::regprocedure) then
   raise exception 'CMS function must use invoker privileges: %',signature;
  end if;
 end loop;
 if has_table_privilege('service_role','public.nufi_management_audit','UPDATE') or
    has_table_privilege('service_role','public.nufi_management_audit','DELETE') or
    has_table_privilege('service_role','public.nufi_content','DELETE') then
  raise exception 'Server role can delete content or rewrite audit history';
 end if;
end $$;

set local role service_role;
-- A real service-role invocation catches missing auth.users grants.
do $$ declare result jsonb; begin
 result:=public.nufi_manage_members('cms-',1,25);
 if (result->>'total')::int<>4 or jsonb_array_length(result->'items')<>4 then
  raise exception 'Member management failed to include accounts without planner state';
 end if;
 if not exists(select 1 from jsonb_array_elements(result->'items') item
    where item->>'userId'='74444444-4444-4444-8444-444444444444' and item->'workspaceVersion'='null'::jsonb) then
  raise exception 'Never-onboarded account missing from member management';
 end if;
 result:=public.nufi_manage_members('cms-',2,2);
 if (result->>'total')::int<>4 or jsonb_array_length(result->'items')<>2 then
  raise exception 'Member pagination lost total or rows';
 end if;
 if (public.nufi_manage_overview()->'counts'->>'admins')::int<>2 then
  raise exception 'Administrator overview count incorrect';
 end if;
 begin
  perform public.nufi_manage_members('',0,25);
  raise exception 'Invalid member page accepted';
 exception when sqlstate 'PT400' then null; end;
end $$;

-- Draft saves preserve the published snapshot; publishing replaces it atomically.
select public.nufi_manage_save_content('71111111-1111-4111-8111-111111111111','page','cms-page',0,
 '{"title":"Published original","publicationStatus":"published"}');
select public.nufi_manage_save_content('71111111-1111-4111-8111-111111111111','page','cms-page',1,
 '{"title":"Draft revision","publicationStatus":"draft"}');
do $$ begin
 if (select payload->>'title' from public.nufi_content where id='cms-page')<>'Draft revision' or
    (select published_payload->>'title' from public.nufi_content where id='cms-page')<>'Published original' then
  raise exception 'Draft overwrote the published page';
 end if;
 begin
  perform public.nufi_manage_save_content('72222222-2222-4222-8222-222222222222','page','cms-page',1,
   '{"title":"Stale second editor","publicationStatus":"published"}');
  raise exception 'Stale content version accepted';
 exception when serialization_failure then null; end;
 if (select version from public.nufi_content where id='cms-page')<>2 or
    (select count(*) from public.nufi_management_audit where content_id='cms-page')<>2 then
  raise exception 'Conflicting content save mutated content or audit';
 end if;
 begin
  perform public.nufi_manage_save_content('73333333-3333-4333-8333-333333333333','page','cms-page',2,
   '{"title":"Member injection","publicationStatus":"published"}');
  raise exception 'Member actor saved website content';
 exception when sqlstate 'PT403' then null; end;
end $$;
select public.nufi_manage_save_content('72222222-2222-4222-8222-222222222222','page','cms-page',2,
 '{"title":"New published title","publicationStatus":"published"}');
do $$ begin
 if (select published_payload->>'title' from public.nufi_content where id='cms-page')<>'New published title' or
    (select version from public.nufi_content where id='cms-page')<>3 then
  raise exception 'Publishing did not replace the public snapshot';
 end if;
end $$;

-- Both original free access and private-account access are checked in the DB.
do $$ declare free_id text; payload jsonb; begin
 select id into free_id from public.nufi_recipe_catalogue where book_id='high-protein-kitchen' order by recipe_number limit 1;
 payload:='{"name":"Admin recipe edit","publicationStatus":"published","access":"free","ingredients":[{"name":"Reviewed ingredient"}],"steps":["Reviewed method"],"nutrition":null}'::jsonb;
 perform public.nufi_manage_save_content('71111111-1111-4111-8111-111111111111','recipe',free_id,0,payload);
 begin
  perform public.nufi_manage_save_content('71111111-1111-4111-8111-111111111111','recipe',free_id,1,payload||'{"access":"account"}');
  raise exception 'Original free recipe was restricted';
 exception when sqlstate 'PT400' then null; end;
 begin
  perform public.nufi_manage_save_content('71111111-1111-4111-8111-111111111111','recipe',free_id,1,payload||'{"publicationStatus":"held"}');
  raise exception 'Original free recipe was hidden';
 exception when sqlstate 'PT400' then null; end;
 begin
  perform public.nufi_manage_save_content('71111111-1111-4111-8111-111111111111','recipe',free_id,1,payload||'{"sourceSha256":"forged"}');
  raise exception 'Source recipe provenance was replaced';
 exception when sqlstate 'PT400' then null; end;
 payload:=payload||'{"access":"account","publicationStatus":"held"}'::jsonb;
 perform public.nufi_manage_save_content('71111111-1111-4111-8111-111111111111','recipe','cms-private-recipe',0,payload);
 if (select c.payload->'nutrition' from public.nufi_content c where c.id='cms-private-recipe')<>'null'::jsonb then
  raise exception 'Unknown recipe nutrition was altered';
 end if;
 begin
  perform public.nufi_manage_save_content('71111111-1111-4111-8111-111111111111','recipe','cms-private-recipe',1,payload||'{"access":"free"}');
  raise exception 'Private recipe was made free';
 exception when sqlstate 'PT400' then null; end;
 begin
  perform public.nufi_manage_save_content('71111111-1111-4111-8111-111111111111','recipe','cms-private-recipe',1,payload-'nutrition');
  raise exception 'Missing recipe nutrition value was accepted';
 exception when sqlstate 'PT400' then null; end;
 if (select c.payload->>'name' from public.nufi_private_recipe_content c where c.id='cms-private-recipe')<>'Original private recipe' then
  raise exception 'Editing an overlay rewrote imported source content';
 end if;
end $$;

-- Administrative changes use an authoritative fresh role plus version checks.
do $$ declare prior_time timestamptz; next_time timestamptz; result jsonb; begin
 select updated_at into prior_time from public.nufi_members where user_id='73333333-3333-4333-8333-333333333333';
 begin
  perform public.nufi_manage_update_member('71111111-1111-4111-8111-111111111111','73333333-3333-4333-8333-333333333333',prior_time,'Member','admin','active',false);
  raise exception 'Admin promotion lacked explicit confirmation';
 exception when sqlstate 'PT400' then null; end;
 result:=public.nufi_manage_update_member('71111111-1111-4111-8111-111111111111','73333333-3333-4333-8333-333333333333',prior_time,'Member renamed','member','suspended',false);
 next_time:=(result->>'updatedAt')::timestamptz;
 if result->>'status'<>'suspended' or next_time=prior_time then raise exception 'Member update was not persisted with a new version'; end if;
 begin
  perform public.nufi_manage_update_member('72222222-2222-4222-8222-222222222222','73333333-3333-4333-8333-333333333333',prior_time,'Stale editor','member','active',false);
  raise exception 'Stale member overwrite accepted';
 exception when serialization_failure then null; end;
 if (select first_name from public.nufi_members where user_id='73333333-3333-4333-8333-333333333333')<>'Member renamed' then
  raise exception 'Stale member edit changed the authoritative row';
 end if;
 select updated_at into prior_time from public.nufi_members where user_id='71111111-1111-4111-8111-111111111111';
 begin
  perform public.nufi_manage_update_member('71111111-1111-4111-8111-111111111111','71111111-1111-4111-8111-111111111111',prior_time,'First admin','member','active',false);
  raise exception 'Self administrator demotion succeeded';
 exception when sqlstate 'PT400' then null; end;
 begin
  perform public.nufi_manage_update_member('71111111-1111-4111-8111-111111111111','71111111-1111-4111-8111-111111111111',prior_time,'First admin','admin','suspended',false);
  raise exception 'Self administrator suspension succeeded';
 exception when sqlstate 'PT400' then null; end;
 select updated_at into prior_time from public.nufi_members where user_id='72222222-2222-4222-8222-222222222222';
 perform public.nufi_manage_update_member('71111111-1111-4111-8111-111111111111','72222222-2222-4222-8222-222222222222',prior_time,'Second admin','admin','suspended',false);
 begin
  perform public.nufi_manage_save_content('72222222-2222-4222-8222-222222222222','page','cms-page',3,'{"title":"Stale administrator","publicationStatus":"published"}');
  raise exception 'Suspended administrator retained content privileges';
 exception when sqlstate 'PT403' then null; end;
 begin
  perform public.nufi_manage_update_member('72222222-2222-4222-8222-222222222222','71111111-1111-4111-8111-111111111111',null,'First admin','member','active',false);
  raise exception 'Suspended actor revoked the last administrator';
 exception when sqlstate 'PT403' then null; end;
 if (select count(*) from public.nufi_members where role='admin' and status='active')<>1 then
  raise exception 'Last active administrator was lost';
 end if;
end $$;
reset role;

-- Force an audit failure after mutation to prove changes cannot partially commit.
create function public.nufi_test_reject_audit() returns trigger language plpgsql as $$
begin
 if new.content_id='cms-page' or new.content_id='73333333-3333-4333-8333-333333333333' then
  raise exception 'Injected audit storage failure' using errcode='22000';
 end if;
 return new;
end $$;
create trigger nufi_test_reject_audit before insert on public.nufi_management_audit
for each row execute function public.nufi_test_reject_audit();
set local role service_role;
do $$ declare prior_time timestamptz; prior_count int; begin
 select count(*) into prior_count from public.nufi_management_audit;
 begin
  perform public.nufi_manage_save_content('71111111-1111-4111-8111-111111111111','page','cms-page',3,
   '{"title":"Must roll back","publicationStatus":"published"}');
  raise exception 'Injected audit failure did not fail content save';
 exception when sqlstate '22000' then null; end;
 if (select version from public.nufi_content where id='cms-page')<>3 or
    (select published_payload->>'title' from public.nufi_content where id='cms-page')<>'New published title' then
  raise exception 'Content update survived failed audit';
 end if;
 select updated_at into prior_time from public.nufi_members where user_id='73333333-3333-4333-8333-333333333333';
 begin
  perform public.nufi_manage_update_member('71111111-1111-4111-8111-111111111111','73333333-3333-4333-8333-333333333333',prior_time,'Must roll back','admin','active',true);
  raise exception 'Injected audit failure did not fail member save';
 exception when sqlstate '22000' then null; end;
 if (select role from public.nufi_members where user_id='73333333-3333-4333-8333-333333333333')<>'member' or
    (select status from public.nufi_members where user_id='73333333-3333-4333-8333-333333333333')<>'suspended' then
  raise exception 'Member access changed despite failed audit';
 end if;
 if (select count(*) from public.nufi_management_audit)<>prior_count then raise exception 'Failed transactions added audit records'; end if;
 if (public.nufi_manage_audit('cms-page',1,25)->>'total')::int<>3 then
  raise exception 'Audit search did not retain successful content history';
 end if;
end $$;
reset role;

set local role anon;
do $$ begin
 begin
  perform * from public.nufi_content;
  raise exception 'Anonymous draft/private overlay read allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.nufi_manage_overview();
  raise exception 'Anonymous admin overview RPC allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.nufi_manage_save_content('71111111-1111-4111-8111-111111111111','page','cms-page',3,'{"publicationStatus":"published"}');
  raise exception 'Anonymous actor spoofing allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','73333333-3333-4333-8333-333333333333',true);
do $$ begin
 begin
  perform * from public.nufi_management_audit;
  raise exception 'Member direct audit read allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.nufi_content set payload='{"publicationStatus":"published"}';
  raise exception 'Member direct content update allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.nufi_manage_members('',1,25);
  raise exception 'Member direct member-list RPC allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.nufi_manage_update_member('71111111-1111-4111-8111-111111111111','73333333-3333-4333-8333-333333333333',null,'Forged admin','admin','active',true);
  raise exception 'Member forged actor role escalation allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
select 'PASS: CMS grants, drafts/publication, source/access protection, member/admin guards, stale save rejection, audit rollback, anonymous/member RPC denial' as result;
