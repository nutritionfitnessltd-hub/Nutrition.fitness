create table public.nufi_studio_items (
  id text primary key check(length(id) between 1 and 240),
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  revision integer not null default 1 check(revision>0),
  editor text not null,
  updated_at timestamptz not null default now()
);
create table public.nufi_studio_versions (
  item_id text not null references public.nufi_studio_items(id),
  revision integer not null,
  payload jsonb not null,
  editor text not null,
  created_at timestamptz not null default now(),
  primary key(item_id,revision)
);
create function public.nufi_studio_record_version() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  insert into public.nufi_studio_versions(item_id,revision,payload,editor)
  values(new.id,new.revision,new.payload,new.editor);
  return new;
end;
$$;
create trigger nufi_studio_record_version after insert or update on public.nufi_studio_items
for each row execute function public.nufi_studio_record_version();
create function public.nufi_studio_save(item text, expected integer, document jsonb, editor_name text)
returns setof public.nufi_studio_items
language plpgsql security invoker set search_path='' as $$
begin
  if expected=0 then
    return query insert into public.nufi_studio_items(id,payload,editor)
    values(item,document,editor_name) on conflict(id) do nothing returning *;
  else
    return query update public.nufi_studio_items
    set payload=document,revision=expected+1,editor=editor_name,updated_at=now()
    where id=item and revision=expected returning *;
  end if;
end;
$$;
alter table public.nufi_library_projects
  add column studio jsonb not null default '{}' check(jsonb_typeof(studio)='object');
alter table public.nufi_studio_items enable row level security;
alter table public.nufi_studio_versions enable row level security;
revoke all on public.nufi_studio_items,public.nufi_studio_versions from public,anon,authenticated;
grant select,insert,update on public.nufi_studio_items to service_role;
grant select,insert on public.nufi_studio_versions to service_role;
revoke all on function public.nufi_studio_save(text,integer,jsonb,text) from public,anon,authenticated;
revoke all on function public.nufi_studio_record_version() from public,anon,authenticated;
grant execute on function public.nufi_studio_save(text,integer,jsonb,text),public.nufi_studio_record_version() to service_role;

create function public.nufi_studio_create_project(project jsonb, records jsonb, editor_name text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare project_id uuid := (project->>'id')::uuid;
begin
  if exists(select 1 from public.nufi_library_projects where id=project_id) then return project_id; end if;
  insert into public.nufi_library_projects(id,name,creator_id,created_by,weeks,brief,entries,studio)
  values(project_id,project->>'name',(project->>'creator_id')::uuid,(project->>'created_by')::uuid,
    (project->>'weeks')::integer,project->>'brief',project->'entries',project->'studio') on conflict(id) do nothing;
  if not found then return project_id; end if;
  insert into public.nufi_studio_items(id,payload,editor)
  select r->>'id',r,editor_name from jsonb_array_elements(records) r;
  return project_id;
end;
$$;
revoke all on function public.nufi_studio_create_project(jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.nufi_studio_create_project(jsonb,jsonb,text) to service_role;

create function public.nufi_studio_attach_item(project_id uuid, expected integer, document jsonb, entry jsonb, editor_name text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.nufi_library_projects set entries=case when entry->>'replaces' is not null then
    (select jsonb_agg(case when e->>'id'=entry->>'replaces' then entry-'replaces' else e end) from jsonb_array_elements(entries) e)
    else entries||jsonb_build_array(entry-'replaces') end,revision=revision+1
  where id=project_id and revision=expected;
  if not found then raise exception using errcode='40001',message='Project changed'; end if;
  insert into public.nufi_studio_items(id,payload,editor) values(document->>'id',document,editor_name);
  return true;
end;
$$;
revoke all on function public.nufi_studio_attach_item(uuid,integer,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.nufi_studio_attach_item(uuid,integer,jsonb,jsonb,text) to service_role;

create function public.nufi_studio_import(records jsonb, project_id uuid, expected integer, editor_name text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.nufi_studio_items where id=records->0->>'id') then return true; end if;
  if project_id is not null then
    update public.nufi_library_projects set entries=entries||(
      select jsonb_agg(jsonb_build_object('id',r->>'id','week',0,'title',r->>'title','kind',r->>'kind',
        'record',r->>'id','assignedAsset',true,'status','In progress','notes','Compare the imported draft with its source.'))
      from jsonb_array_elements(records) r),revision=revision+1 where id=project_id and revision=expected;
    if not found then raise exception using errcode='40001',message='Project changed'; end if;
  end if;
  insert into public.nufi_studio_items(id,payload,editor)
    select r->>'id',r,editor_name from jsonb_array_elements(records) r;
  return true;
end;
$$;
revoke all on function public.nufi_studio_import(jsonb,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.nufi_studio_import(jsonb,uuid,integer,text) to service_role;
