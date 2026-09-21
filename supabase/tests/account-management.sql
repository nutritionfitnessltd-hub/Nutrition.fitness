-- Disposable integration database only. Run after the real schema migrations.
-- These fixtures and mutations are rolled back.
begin;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('61111111-1111-4111-8111-111111111111','account-security-one@example.test',now(),'{"first_name":"One","role":"admin","is_admin":true}'),
 ('62222222-2222-4222-8222-222222222222','account-security-two@example.test',now(),'{"first_name":"Two"}');

-- Both account and reset ledgers are server-only, even for a signed-in member.
do $$ declare actor text; relation text; permission text; begin
 foreach relation in array array['nufi_members','nufi_password_recoveries'] loop
  if not (select relrowsecurity from pg_class where oid=('public.'||relation)::regclass) then
   raise exception 'RLS missing on %',relation;
  end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename=relation) then
   raise exception 'Unexpected browser policy on server-only table %',relation;
  end if;
  foreach actor in array array['anon','authenticated'] loop
   foreach permission in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    if has_table_privilege(actor,'public.'||relation,permission) then
     raise exception 'Unexpected % grant for % on %',permission,actor,relation;
    end if;
   end loop;
  end loop;
 end loop;
 foreach permission in array array['UPDATE','TRUNCATE','REFERENCES','TRIGGER'] loop
  if has_table_privilege('service_role','public.nufi_password_recoveries',permission) then
   raise exception 'Unexpected % grant on reset ledger for server role',permission;
  end if;
 end loop;
end $$;

set local role service_role;
insert into public.nufi_members(user_id,first_name) values
 ('61111111-1111-4111-8111-111111111111','One'),
 ('62222222-2222-4222-8222-222222222222','Two');
do $$ begin
 if (select role from public.nufi_members where user_id='61111111-1111-4111-8111-111111111111')<>'member' then
  raise exception 'A new member received administrator access from editable metadata';
 end if;
 begin
  update public.nufi_members set role='owner' where user_id='61111111-1111-4111-8111-111111111111';
  raise exception 'Invalid role accepted';
 exception when check_violation then null; end;
 begin
  update public.nufi_members set status='unchecked' where user_id='61111111-1111-4111-8111-111111111111';
  raise exception 'Invalid status accepted';
 exception when check_violation then null; end;
 begin
  insert into public.nufi_password_recoveries(token_hash,user_id,access_ciphertext,expires_at)
  values('not-a-hash','61111111-1111-4111-8111-111111111111',repeat('x',80),now()+interval '10 minutes');
  raise exception 'Malformed reset token hash accepted';
 exception when check_violation then null; end;
 begin
  insert into public.nufi_password_recoveries(token_hash,user_id,access_ciphertext,expires_at)
  values(repeat('a',64),'61111111-1111-4111-8111-111111111111',repeat('x',80),now()+interval '12 minutes');
  raise exception 'Long-lived reset token accepted';
 exception when check_violation then null; end;
 begin
  insert into public.nufi_password_recoveries(token_hash,user_id,access_ciphertext,expires_at)
  values(repeat('a',64),'61111111-1111-4111-8111-111111111111','plain',now()+interval '10 minutes');
  raise exception 'Undersized encrypted recovery value accepted';
 exception when check_violation then null; end;
end $$;

insert into public.nufi_password_recoveries(token_hash,user_id,access_ciphertext,expires_at)
values(repeat('a',64),'61111111-1111-4111-8111-111111111111',repeat('x',80),now()+interval '10 minutes');
insert into public.nufi_password_recoveries(token_hash,user_id,access_ciphertext,created_at,expires_at)
values(repeat('b',64),'62222222-2222-4222-8222-222222222222',repeat('y',80),now()-interval '11 minutes',now()-interval '1 minute');

-- Same predicate and atomic DELETE RETURNING used by the password-reset API.
do $$ declare consumed_user uuid; affected integer; begin
 delete from public.nufi_password_recoveries
 where token_hash=repeat('a',64) and expires_at>now()
 returning user_id into consumed_user;
 get diagnostics affected=row_count;
 if affected<>1 or consumed_user<>'61111111-1111-4111-8111-111111111111' then
  raise exception 'Valid reset grant was not consumed once for its owner';
 end if;
 delete from public.nufi_password_recoveries
 where token_hash=repeat('a',64) and expires_at>now()
 returning user_id into consumed_user;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Reset grant replay succeeded'; end if;
 delete from public.nufi_password_recoveries
 where token_hash=repeat('b',64) and expires_at>now()
 returning user_id into consumed_user;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Expired reset grant was consumed'; end if;
 begin
  update public.nufi_password_recoveries set expires_at=now()+interval '10 minutes';
  raise exception 'Server role was allowed to extend a reset grant';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role anon;
do $$ begin
 begin
  perform * from public.nufi_members;
  raise exception 'Anonymous member list read allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.nufi_members set role='admin';
  raise exception 'Anonymous admin escalation allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform * from public.nufi_password_recoveries;
  raise exception 'Anonymous password reset grant read allowed';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.nufi_password_recoveries;
  raise exception 'Anonymous password reset grant consumption allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','61111111-1111-4111-8111-111111111111',true);
do $$ begin
 begin
  perform * from public.nufi_members;
  raise exception 'Authenticated direct member list read allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.nufi_members set role='admin' where user_id=auth.uid();
  raise exception 'Authenticated self-escalation allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.nufi_members(user_id,role) values(auth.uid(),'admin');
  raise exception 'Authenticated direct admin creation allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform * from public.nufi_password_recoveries where user_id=auth.uid();
  raise exception 'Authenticated reset grant disclosure allowed';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.nufi_password_recoveries where user_id=auth.uid();
  raise exception 'Authenticated direct reset grant consumption allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
select 'PASS: server-only account grants, role constraints, default member access, one-use reset ledger, expiry and anonymous/member denial' as result;
