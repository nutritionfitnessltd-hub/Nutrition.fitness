create or replace function public.nufi_library_can_open_asset(staff uuid, items text[])
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.nufi_library_tasks t where t.staff_id = staff and t.record_id = any(items)
  ) or exists (
    select 1 from public.nufi_library_projects p
    cross join lateral jsonb_array_elements(p.entries) e
    where p.creator_id = staff and e->>'record' = any(items) and e->'assignedAsset' = 'true'::jsonb
  );
$$;
revoke all on function public.nufi_library_can_open_asset(uuid,text[]) from public, anon, authenticated;
grant execute on function public.nufi_library_can_open_asset(uuid,text[]) to service_role;
