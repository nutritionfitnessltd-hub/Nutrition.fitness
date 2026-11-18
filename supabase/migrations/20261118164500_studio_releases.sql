create table public.nufi_studio_releases (
 item_id text not null references public.nufi_studio_items(id),
 environment text not null check(environment in ('test','live')),
 source_revision integer not null,
 payload jsonb not null,
 approved_by text not null,
 published_at timestamptz not null default now(),
 primary key(item_id,environment)
);
alter table public.nufi_studio_releases enable row level security;
revoke all on public.nufi_studio_releases from public,anon,authenticated;
grant select,insert,update on public.nufi_studio_releases to service_role;
create function public.nufi_studio_release(item text,expected integer,target text,approved_by text)
returns setof public.nufi_studio_releases language plpgsql security invoker set search_path='' as $$
declare current public.nufi_studio_items; snapshot jsonb;
begin
 if target not in ('test','live') then raise exception using errcode='PT400',message='Choose a release destination'; end if;
 select * into current from public.nufi_studio_items where id=item for update;
 if not found or current.revision<>expected then raise exception using errcode='40001',message='Content changed'; end if;
 if current.payload->>'status'<>'Approved' or (current.payload->'approval'->>'revision')::integer is distinct from expected
 then raise exception using errcode='PT400',message='Approve this version first'; end if;
 if target='live' and not exists(select 1 from public.nufi_studio_releases r where r.item_id=item and r.environment='test' and r.source_revision=expected)
 then raise exception using errcode='PT400',message='Publish this version to the test website first'; end if;
 snapshot=jsonb_build_object('id',item,'title',current.payload->'title','kind',current.payload->'kind','fields',current.payload->'fields','workerImage',current.payload->'workerImage','articleImage',current.payload->'articleImage');
 return query insert into public.nufi_studio_releases as r(item_id,environment,source_revision,payload,approved_by)
 values(item,target,expected,snapshot,nufi_studio_release.approved_by)
 on conflict(item_id,environment) do update set source_revision=excluded.source_revision,payload=excluded.payload,approved_by=excluded.approved_by,published_at=now()
 returning r.*;
end;
$$;
revoke all on function public.nufi_studio_release(text,integer,text,text) from public,anon,authenticated;
grant execute on function public.nufi_studio_release(text,integer,text,text) to service_role;
