-- Source schema, applied after account-management and existing recipe schemas.
-- Server-only CMS overlays: originals, membership workspaces and book imports stay intact.
begin;

create table public.nufi_content (
  content_type text not null check (content_type in ('recipe','page','product','settings')),
  id text not null check (id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  published_payload jsonb check (jsonb_typeof(published_payload)='object'),
  version bigint not null default 1 check (version>0),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default clock_timestamp(),
  published_at timestamptz,
  primary key(content_type,id),
  check (octet_length(payload::text)<=200000),
  check (payload->>'publicationStatus' in ('draft','held','published'))
);
create table public.nufi_management_audit (
  id bigint generated always as identity primary key,
  actor uuid not null references auth.users(id),
  action text not null,
  content_type text not null,
  content_id text not null,
  from_version bigint,
  to_version bigint,
  at timestamptz not null default clock_timestamp()
);
create index nufi_management_audit_recent on public.nufi_management_audit(at desc,id desc);
alter table public.nufi_content enable row level security;
alter table public.nufi_content force row level security;
alter table public.nufi_management_audit enable row level security;
alter table public.nufi_management_audit force row level security;
revoke all on public.nufi_content,public.nufi_management_audit from public,anon,authenticated,service_role;
grant select,insert,update on public.nufi_content to service_role;
grant select,insert on public.nufi_management_audit to service_role;
grant usage,select on sequence public.nufi_management_audit_id_seq to service_role;
-- Only these account columns are needed by the protected reporting functions.
grant usage on schema auth to service_role;
grant select(id,email,email_confirmed_at,created_at,deleted_at) on auth.users to service_role;

-- SECURITY INVOKER intentionally uses only the narrowly granted server role.
-- Fresh actor status is rechecked within the same lock as every mutation.
create function public.nufi_manage_save_content(admin_actor uuid,item_type text,item_id text,expected_version bigint,next_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior public.nufi_content; saved public.nufi_content; free_recipe boolean; status_value text;
begin
  perform pg_advisory_xact_lock(hashtextextended('nufi:administrator-membership',0));
  if not exists(select 1 from public.nufi_members where user_id=admin_actor and role='admin' and status='active') then
    raise exception 'Administrator access is required' using errcode='PT403';
  end if;
  if item_type is null or item_type not in ('recipe','page','product','settings') or item_id is null or item_id !~ '^[a-z0-9][a-z0-9-]{0,79}$' or expected_version is null or expected_version<0 or
     jsonb_typeof(next_payload) is distinct from 'object' or octet_length(next_payload::text)>200000 then
    raise exception 'Invalid content' using errcode='PT400';
  end if;
  status_value:=next_payload->>'publicationStatus';
  if item_type='recipe' then
    select exists(select 1 from public.nufi_recipe_catalogue where id=item_id and book_id='high-protein-kitchen') into free_recipe;
    if not free_recipe and not exists(select 1 from public.nufi_private_recipe_content where id=item_id) then
      raise exception 'Source recipe is missing' using errcode='PT404';
    end if;
    if status_value is null or status_value not in ('held','published') or
      (free_recipe and (status_value<>'published' or (next_payload->>'access') is distinct from 'free')) or
      (not free_recipe and (next_payload->>'access') is distinct from 'account') then
      raise exception 'Recipe access cannot be changed' using errcode='PT400';
    end if;
    if next_payload ?| array['source','sourceSha256','sourcePage','sourceBook','sourceNutrition','sourceNutritionPrinted'] then
      raise exception 'Original recipe provenance is immutable' using errcode='PT400';
    end if;
    if jsonb_typeof(next_payload->'ingredients') is distinct from 'array' or jsonb_typeof(next_payload->'steps') is distinct from 'array' or
       jsonb_typeof(next_payload->'nutrition') is null or jsonb_typeof(next_payload->'nutrition') not in ('object','null') then
      raise exception 'Recipe details are incomplete' using errcode='PT400';
    end if;
    if jsonb_array_length(next_payload->'ingredients') not between 1 and 80 or jsonb_array_length(next_payload->'steps') not between 1 and 50 then
      raise exception 'Recipe details are incomplete' using errcode='PT400';
    end if;
  elsif status_value is null or status_value not in ('draft','published') then
    raise exception 'Invalid publication state' using errcode='PT400';
  end if;
  select * into prior from public.nufi_content where content_type=item_type and id=item_id for update;
  if coalesce(prior.version,0)<>expected_version then raise exception 'Content has changed' using errcode='40001'; end if;
  insert into public.nufi_content(content_type,id,payload,published_payload,version,updated_by,updated_at,published_at)
  values(item_type,item_id,next_payload,
    case when status_value='published' then next_payload when item_type='recipe' then null else prior.published_payload end,
    expected_version+1,admin_actor,clock_timestamp(),case when status_value='published' then clock_timestamp() else prior.published_at end)
  on conflict(content_type,id) do update set payload=excluded.payload,published_payload=excluded.published_payload,version=excluded.version,
    updated_by=excluded.updated_by,updated_at=excluded.updated_at,published_at=excluded.published_at
  returning * into saved;
  insert into public.nufi_management_audit(actor,action,content_type,content_id,from_version,to_version)
  values(admin_actor,case when status_value='published' then 'Published content' when status_value='held' then 'Held recipe for review' else 'Saved draft' end,item_type,item_id,expected_version,saved.version);
  return jsonb_build_object('version',saved.version,'updated_at',saved.updated_at,'published_at',saved.published_at);
end;$$;

create function public.nufi_manage_update_member(admin_actor uuid,target uuid,expected_updated_at timestamptz,first_name_value text,role_value text,status_value text,confirm_admin boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior public.nufi_members; saved public.nufi_members;
begin
  perform pg_advisory_xact_lock(hashtextextended('nufi:administrator-membership',0));
  if not exists(select 1 from public.nufi_members where user_id=admin_actor and role='admin' and status='active') then
    raise exception 'Administrator access is required' using errcode='PT403';
  end if;
  if target is null or first_name_value is null or length(trim(first_name_value)) not between 1 and 80 or
      role_value is null or role_value not in ('member','admin') or status_value is null or status_value not in ('active','suspended') then
    raise exception 'Invalid member change' using errcode='PT400';
  end if;
  if target=admin_actor and (role_value<>'admin' or status_value<>'active') then
    raise exception 'Cannot remove your own administrator access' using errcode='PT400';
  end if;
  if not exists(select 1 from auth.users where id=target and deleted_at is null) then
    raise exception 'Member not found' using errcode='PT404';
  end if;
  select * into prior from public.nufi_members where user_id=target for update;
  if prior.updated_at is distinct from expected_updated_at then raise exception 'Member has changed' using errcode='40001'; end if;
  if role_value='admin' and coalesce(prior.role,'member')<>'admin' and confirm_admin is distinct from true then
    raise exception 'Confirm administrator promotion explicitly' using errcode='PT400';
  end if;
  if prior.role='admin' and prior.status='active' and (role_value<>'admin' or status_value<>'active') and
      (select count(*) from public.nufi_members where role='admin' and status='active')<=1 then
    raise exception 'Keep at least one active administrator' using errcode='PT400';
  end if;
  insert into public.nufi_members(user_id,first_name,role,status,updated_at)
    values(target,trim(first_name_value),role_value,status_value,clock_timestamp())
  on conflict(user_id) do update set first_name=excluded.first_name,role=excluded.role,status=excluded.status,updated_at=excluded.updated_at
  returning * into saved;
  insert into public.nufi_management_audit(actor,action,content_type,content_id)
    values(admin_actor,case when prior.role is distinct from role_value then 'Changed account role to '||role_value
      when prior.status is distinct from status_value then 'Changed account status to '||status_value else 'Updated member profile' end,'member',target::text);
  return jsonb_build_object('userId',saved.user_id,'firstName',saved.first_name,'role',saved.role,'status',saved.status,
    'createdAt',saved.created_at,'updatedAt',saved.updated_at);
end;$$;

-- Includes verified accounts that have never opened the planner or onboarded.
create function public.nufi_manage_members(search_term text default '',page_number int default 1,page_size int default 25)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare total_count bigint; result jsonb;
begin
  if search_term is null or length(search_term)>100 or page_number not between 1 and 10000 or page_size not between 1 and 100 then
    raise exception 'Invalid pagination' using errcode='PT400';
  end if;
  select count(*) into total_count from auth.users u left join public.nufi_members m on m.user_id=u.id
    where u.deleted_at is null and (search_term='' or position(lower(search_term) in lower(coalesce(u.email,'')||' '||coalesce(m.first_name,'')||' '||u.id::text))>0);
  select coalesce(jsonb_agg(row_data order by created_at desc,user_id),'[]'::jsonb) into result from (
    select u.created_at,u.id as user_id,jsonb_build_object('userId',u.id,'email',u.email,'emailVerified',u.email_confirmed_at is not null,
      'firstName',coalesce(m.first_name,''),'role',coalesce(m.role,'member'),'status',coalesce(m.status,'active'),
      'createdAt',coalesce(m.created_at,u.created_at),'updatedAt',m.updated_at,'onboarding',w.state->'onboarding',
      'workspaceVersion',w.version,'workspaceUpdatedAt',w.updated_at) as row_data
    from auth.users u left join public.nufi_members m on m.user_id=u.id left join public.nufi_workspaces w on w.user_id=u.id
    where u.deleted_at is null and (search_term='' or position(lower(search_term) in lower(coalesce(u.email,'')||' '||coalesce(m.first_name,'')||' '||u.id::text))>0)
    order by u.created_at desc,u.id offset (page_number-1)*page_size limit page_size
  ) page_rows;
  return jsonb_build_object('items',result,'total',total_count,'page',page_number,'pageSize',page_size);
end;$$;

create function public.nufi_manage_audit(search_term text default '',page_number int default 1,page_size int default 25)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare total_count bigint; result jsonb;
begin
  if search_term is null or length(search_term)>100 or page_number not between 1 and 10000 or page_size not between 1 and 100 then
    raise exception 'Invalid pagination' using errcode='PT400';
  end if;
  with audit_rows as (
    select 'cms-'||id::text as id,actor,action,content_type,content_id,at from public.nufi_management_audit
    union all select 'account-'||id::text,actor,action,'member',target::text,at from public.nufi_admin_audit
  ) select count(*) into total_count from audit_rows where search_term='' or position(lower(search_term) in lower(action||' '||content_type||' '||coalesce(content_id,'')))>0;
  with audit_rows as (
    select 'cms-'||id::text as id,actor,action,content_type,content_id,at from public.nufi_management_audit
    union all select 'account-'||id::text,actor,action,'member',target::text,at from public.nufi_admin_audit
  ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'actor',actor,'action',action,'contentType',content_type,'contentId',content_id,'at',at) order by at desc,id desc),'[]'::jsonb)
    into result from (select * from audit_rows where search_term='' or position(lower(search_term) in lower(action||' '||content_type||' '||coalesce(content_id,'')))>0
      order by at desc,id desc offset (page_number-1)*page_size limit page_size) page_rows;
  return jsonb_build_object('items',result,'total',total_count,'page',page_number,'pageSize',page_size);
end;$$;

create function public.nufi_manage_overview() returns jsonb language sql security invoker set search_path='' as $$
  select jsonb_build_object('counts',jsonb_build_object(
    'members',(select count(*) from auth.users where deleted_at is null),
    'activeMembers',(select count(*) from auth.users u left join public.nufi_members m on m.user_id=u.id where u.deleted_at is null and coalesce(m.status,'active')='active'),
    'suspendedMembers',(select count(*) from public.nufi_members where status='suspended'),
    'admins',(select count(*) from public.nufi_members where role='admin' and status='active')),
    'recentAudit',public.nufi_manage_audit('',1,8)->'items');
$$;

revoke all on function public.nufi_manage_save_content(uuid,text,text,bigint,jsonb),
  public.nufi_manage_update_member(uuid,uuid,timestamptz,text,text,text,boolean),
  public.nufi_manage_members(text,int,int),public.nufi_manage_audit(text,int,int),public.nufi_manage_overview()
  from public,anon,authenticated;
grant execute on function public.nufi_manage_save_content(uuid,text,text,bigint,jsonb),
  public.nufi_manage_update_member(uuid,uuid,timestamptz,text,text,text,boolean),
  public.nufi_manage_members(text,int,int),public.nufi_manage_audit(text,int,int),public.nufi_manage_overview()
  to service_role;

comment on table public.nufi_content is 'Server-only content overlays. Drafts retain the prior published snapshot. Original recipe files and database payloads are immutable.';
comment on table public.nufi_management_audit is 'Administrator change log; holds identifiers and actions, never source recipes, passwords, tokens or personal health data.';
commit;
