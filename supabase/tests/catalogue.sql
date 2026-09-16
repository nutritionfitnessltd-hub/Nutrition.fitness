begin;
do $$ begin
 if (select count(*) from public.nufi_recipe_catalogue)<>100 then raise exception 'Expected 100 catalogue recipes'; end if;
 if (select count(*) from public.nufi_recipe_catalogue where category='Drinks')<>15 then raise exception 'Drinks category missing'; end if;
 if (select (nutrition->>'protein')::int from public.nufi_recipe_catalogue where recipe_number=72)<>7 then raise exception 'Per-ball protein altered'; end if;
 if (select servings from public.nufi_recipe_catalogue where recipe_number=3)<>9 then raise exception 'Muffin yield altered'; end if;
 if (select servings from public.nufi_recipe_catalogue where recipe_number=14)<>1 then raise exception 'Source conflict silently corrected'; end if;
 if (select count(*) from public.nufi_recipe_catalogue where payload->>'image'<>'')<>99 then raise exception 'Source image inventory differs'; end if;
end $$;
set local role anon;
do $$ begin
 if (select count(*) from public.nufi_recipe_catalogue)<>100 then raise exception 'Public catalogue read missing'; end if;
 begin
  update public.nufi_recipe_catalogue set servings=999 where recipe_number=1;
  raise exception 'Unauthorised catalogue write allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
rollback;
select 'PASS: 100 source recipes, category counts, source measures and read-only RLS' as result;
