-- Public, read-only source catalogue. Personal recipe edits stay in their existing private workspace.
begin;
create table if not exists public.nufi_cookbooks (
 id text primary key,
 title text not null,
 source_file text not null,
 source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
 page_count integer not null check(page_count>0),
 recipe_count integer not null check(recipe_count>0)
);
create table if not exists public.nufi_recipe_catalogue (
 id text primary key check(id ~ '^[a-z0-9][a-z0-9-]*$'),
 book_id text not null references public.nufi_cookbooks(id),
 recipe_number integer not null check(recipe_number>0),
 source_page integer not null check(source_page>0),
 name text not null,
 category text not null check(category in ('Breakfast','Lunch','Dinner','Snacks','Drinks')),
 servings numeric not null check(servings>0),
 serving_label text not null,
 nutrition jsonb not null check(jsonb_typeof(nutrition)='object'),
 ingredients jsonb not null check(jsonb_typeof(ingredients)='array'),
 method jsonb not null check(jsonb_typeof(method)='array'),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 editor_override boolean not null default false,
 unique(book_id,recipe_number)
);
create index if not exists nufi_recipe_catalogue_category on public.nufi_recipe_catalogue(category,recipe_number);
alter table public.nufi_cookbooks enable row level security;
alter table public.nufi_recipe_catalogue enable row level security;
revoke all on public.nufi_cookbooks,public.nufi_recipe_catalogue from public,anon,authenticated;
grant select on public.nufi_cookbooks,public.nufi_recipe_catalogue to anon,authenticated;
grant all on public.nufi_cookbooks,public.nufi_recipe_catalogue to service_role;
drop policy if exists cookbook_public_read on public.nufi_cookbooks;
create policy cookbook_public_read on public.nufi_cookbooks for select to anon,authenticated using (true);
drop policy if exists recipe_catalogue_public_read on public.nufi_recipe_catalogue;
create policy recipe_catalogue_public_read on public.nufi_recipe_catalogue for select to anon,authenticated using (true);
commit;
