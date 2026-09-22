-- Server-only budgets for the administrator-provisioned password-login rollout.
-- This migration neither changes an Auth user nor relaxes any existing permissions.
create table public.nufi_login_limits (
  bucket text primary key check (bucket='all' or bucket ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null check (attempts between 1 and 101)
);
create index nufi_login_limits_expiry on public.nufi_login_limits(window_started_at);
alter table public.nufi_login_limits enable row level security;
revoke all on public.nufi_login_limits from public, anon, authenticated;
grant select, insert, update, delete on public.nufi_login_limits to service_role;
comment on table public.nufi_login_limits is 'Server-only rolling-window password attempt counters; contains HMAC account identifiers, never emails, IP addresses, passwords or tokens. No browser policies.';

create function public.nufi_consume_password_attempt(account_bucket text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  stamp timestamptz := clock_timestamp();
  current_bucket text;
  ceiling integer;
  used integer;
  started timestamptz;
  retry integer;
begin
  if account_bucket is null or account_bucket !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='PT400', message='Invalid login budget key';
  end if;
  -- A global row is locked first for every request: no interleaving can overspend
  -- either budget. The global ceiling also bounds new bucket creation under attack.
  foreach current_bucket in array array['all',account_bucket] loop
    ceiling := case when current_bucket='all' then 100 else 10 end;
    insert into public.nufi_login_limits as budget(bucket,window_started_at,attempts)
    values(current_bucket,stamp,1)
    on conflict(bucket) do update
      set attempts = case when budget.window_started_at <= stamp-interval '15 minutes' then 1 else least(budget.attempts+1,ceiling+1) end,
          window_started_at = case when budget.window_started_at <= stamp-interval '15 minutes' then stamp else budget.window_started_at end
    returning attempts,window_started_at into used,started;
    if used > ceiling then
      retry := greatest(1,least(900,ceil(extract(epoch from started+interval '15 minutes'-stamp))::integer));
      return jsonb_build_object('allowed',false,'retry_after',retry);
    end if;
  end loop;
  delete from public.nufi_login_limits where window_started_at < stamp-interval '1 day' and bucket <> 'all';
  return jsonb_build_object('allowed',true,'retry_after',0);
end;
$function$;
revoke all on function public.nufi_consume_password_attempt(text) from public, anon, authenticated;
grant execute on function public.nufi_consume_password_attempt(text) to service_role;
