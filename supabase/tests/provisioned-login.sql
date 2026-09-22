-- Disposable CI database only; all counter mutations are rolled back.
begin;
set local role service_role;
do $test$ declare result jsonb; i integer; begin
  for i in 1..10 loop
    result := public.nufi_consume_password_attempt(repeat('a',64));
    if (result->>'allowed')::boolean is not true then raise exception 'Expected permitted attempt %',i; end if;
  end loop;
  result := public.nufi_consume_password_attempt(repeat('a',64));
  if (result->>'allowed')::boolean is not false or (result->>'retry_after')::integer not between 1 and 900 then raise exception 'Account budget did not block'; end if;
  update public.nufi_login_limits set window_started_at=now()-interval '16 minutes';
  result := public.nufi_consume_password_attempt(repeat('a',64));
  if (result->>'allowed')::boolean is not true then raise exception 'Budget did not reset'; end if;
  begin perform public.nufi_consume_password_attempt('invalid'); raise exception 'Invalid bucket accepted'; exception when sqlstate 'PT400' then null; end;
end $test$;
reset role;
set local role anon;
do $test$ begin
 begin perform * from public.nufi_login_limits limit 1; raise exception 'Unexpected anonymous table access'; exception when insufficient_privilege then null; end;
 begin perform public.nufi_consume_password_attempt(repeat('a',64)); raise exception 'Unexpected anonymous function access'; exception when insufficient_privilege then null; end;
end $test$;
reset role;
set local role authenticated;
do $test$ begin
 begin perform * from public.nufi_login_limits limit 1; raise exception 'Unexpected member table access'; exception when insufficient_privilege then null; end;
 begin perform public.nufi_consume_password_attempt(repeat('a',64)); raise exception 'Unexpected member function access'; exception when insufficient_privilege then null; end;
end $test$;
reset role;
rollback;
