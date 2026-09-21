-- Disposable integration-test database only; the fixture is rolled back.
-- Run after the real migrations and the existing CI auth bootstrap.
begin;

do $$ begin
  if not (select relrowsecurity and relforcerowsecurity from pg_class
          where oid='public.nufi_private_recipe_content'::regclass) then
    raise exception 'Private recipe table must force RLS';
  end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename='nufi_private_recipe_content') then
    raise exception 'This server-only recipe table must not have a browser policy';
  end if;
end; $$;

set local role service_role;
insert into public.nufi_private_recipe_content(id,payload,source_sha256,content_sha256)
values ('private-rls-fixture',jsonb_build_object(
  'id','private-rls-fixture','name','Private fixture','publicationStatus','held',
  'ingredients',jsonb_build_array(jsonb_build_object('name','Fixture ingredient')),
  'steps',jsonb_build_array('Fixture method.'),'nutrition',null,'sourceSha256',repeat('a',64)
),repeat('a',64),repeat('b',64));
do $$ begin
  if (select count(*) from public.nufi_private_recipe_content where id='private-rls-fixture')<>1 then
    raise exception 'Server role could not read private fixture';
  end if;
  if (select payload->'nutrition' from public.nufi_private_recipe_content where id='private-rls-fixture')<>'null'::jsonb then
    raise exception 'Unknown nutrition was not preserved';
  end if;
end; $$;
reset role;

set local role anon;
do $$ begin
  begin
    perform payload from public.nufi_private_recipe_content;
    raise exception 'Anonymous private recipe read was allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.nufi_private_recipe_content set collection_id='snack-happy';
    raise exception 'Anonymous private recipe update was allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.nufi_private_recipe_content;
    raise exception 'Anonymous private recipe delete was allowed';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;

set local role authenticated;
do $$ begin
  begin
    perform payload from public.nufi_private_recipe_content;
    raise exception 'Authenticated direct private recipe read was allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.nufi_private_recipe_content set collection_id='snack-happy';
    raise exception 'Authenticated direct private recipe update was allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.nufi_private_recipe_content;
    raise exception 'Authenticated direct private recipe delete was allowed';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;

-- Privilege assertions include INSERT without duplicating the fixture payload.
do $$ declare actor text; permission text; begin
  foreach actor in array array['anon','authenticated'] loop
    foreach permission in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege(actor,'public.nufi_private_recipe_content',permission) then
        raise exception 'Unexpected % grant for %',permission,actor;
      end if;
    end loop;
  end loop;
  foreach permission in array array['DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    if has_table_privilege('service_role','public.nufi_private_recipe_content',permission) then
      raise exception 'Unexpected % grant for service_role',permission;
    end if;
  end loop;
end; $$;

rollback;
