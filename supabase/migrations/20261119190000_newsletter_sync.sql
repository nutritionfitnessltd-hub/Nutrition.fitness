create table public.nufi_newsletter_sync (
 item_id text primary key references public.nufi_studio_items(id),
 state jsonb not null default '{}',
 lease uuid,
 lease_until timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.nufi_newsletter_sync enable row level security;
revoke all on public.nufi_newsletter_sync from public, anon, authenticated;
grant select,insert,update on public.nufi_newsletter_sync to service_role;
comment on table public.nufi_newsletter_sync is 'Server-only GHL draft mapping, image cache, retry state and lease. Contains no sending jobs or credentials.';

create function public.nufi_claim_newsletter(item text, owner uuid)
returns setof public.nufi_newsletter_sync language plpgsql security invoker set search_path=public as $$
begin
 insert into public.nufi_newsletter_sync(item_id) values(item) on conflict do nothing;
 return query update public.nufi_newsletter_sync set lease=owner,lease_until=now()+interval '3 minutes',updated_at=now()
 where item_id=item and (lease_until is null or lease_until<now()) returning *;
end;
$$;
revoke all on function public.nufi_claim_newsletter(text,uuid) from public,anon,authenticated;
grant execute on function public.nufi_claim_newsletter(text,uuid) to service_role;
