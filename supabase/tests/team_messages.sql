begin;
insert into public.nufi_team_threads(id,member_ids,payload) values
 ('11111111-1111-4111-8111-111111111111','{22222222-2222-4222-8222-222222222222}','{"kind":"group","title":"Disposable test conversation"}');
set local role anon;
do $$ begin
 begin
  perform * from public.nufi_team_threads;
  raise exception 'Anonymous conversation read allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin
  perform * from public.nufi_team_threads;
  raise exception 'Direct browser conversation read allowed';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into public.nufi_team_threads(id,payload) values(gen_random_uuid(),'{}');
  raise exception 'Direct browser conversation write allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
set local role service_role;
do $$ declare n integer; begin
 if(select count(*) from public.nufi_team_threads where member_ids @> array['22222222-2222-4222-8222-222222222222'::uuid])<>1 then raise exception 'Membership lookup failed';end if;
 update public.nufi_team_threads set revision=2 where id='11111111-1111-4111-8111-111111111111' and revision=1;
 get diagnostics n=row_count;if n<>1 then raise exception 'Versioned write failed';end if;
 update public.nufi_team_threads set revision=3 where id='11111111-1111-4111-8111-111111111111' and revision=1;
 get diagnostics n=row_count;if n<>0 then raise exception 'Stale write overwrote conversation';end if;
 begin
  delete from public.nufi_team_threads;
  raise exception 'Hard deletion unexpectedly granted';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
rollback;
select 'PASS: private server-only human messages, membership lookup, version conflicts and no hard deletion' as result;
