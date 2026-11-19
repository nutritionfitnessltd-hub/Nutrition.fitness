-- Review responsibilities are opt-in; existing grants and table privileges are unchanged.
alter table public.nufi_library_staff drop constraint nufi_library_staff_access_shape;
alter table public.nufi_library_staff add constraint nufi_library_staff_access_shape check (
  access is null or (
    jsonb_typeof(access) = 'object'
    and access - array['library','originals','studio','work','edit','ai','sources',
      'review_articles','review_food','review_training','review_courses','review_books','review_challenges','review_marketing'] = '{}'::jsonb
    and not jsonb_path_exists(access, '$.* ? (@.type() != "boolean")')
  )
);
