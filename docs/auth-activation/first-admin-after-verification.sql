-- Apply ONLY to Nutrition.Fitness project fyzapcqcsfpknblsixku after James has
-- registered and verified james@nutrition.fitness through the actual website.
-- This file has not been executed remotely. It cannot mark an email verified.
begin;
do $bootstrap$
declare
  owner_id uuid;
  matching_verified_accounts bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('nufi:administrator-membership',0));
  select count(*), (array_agg(id))[1]
  into matching_verified_accounts, owner_id
  from auth.users
  where lower(email) = 'james@nutrition.fitness'
    and deleted_at is null
    and email_confirmed_at is not null
    and is_anonymous is not true;
  if matching_verified_accounts <> 1 then
    raise exception 'Exactly one verified james@nutrition.fitness account is required; no role was assigned';
  end if;
  if exists (select 1 from public.nufi_members where user_id=owner_id and status='suspended') then
    raise exception 'The owner account is suspended; resolve that status explicitly before assigning access';
  end if;
  if exists (select 1 from public.nufi_members where user_id=owner_id and role='admin' and status='active') then
    return;
  end if;
  insert into public.nufi_members(user_id,first_name,role,status)
  values(owner_id,'James','admin','active')
  on conflict(user_id) do update set role='admin',updated_at=now();
  insert into public.nufi_admin_audit(actor,target,action)
  values(owner_id,owner_id,'Initial website administrator assigned after verified owner email confirmation.');
end;
$bootstrap$;
select m.user_id,u.email,m.role,m.status,u.email_confirmed_at
from public.nufi_members m join auth.users u on u.id=m.user_id
where lower(u.email)='james@nutrition.fitness' and u.deleted_at is null;
commit;
