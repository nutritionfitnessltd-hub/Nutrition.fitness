alter table public.nufi_library_nda_agreements add column requires_identity boolean not null default false;
alter table public.nufi_library_nda_acceptances
  add column signed_details boolean not null default false,
  add column postal_address text,
  add column signature_method text check (signature_method in ('drawn','typed')),
  add column signature_name text,
  add column signature_strokes jsonb,
  add column identity_received boolean not null default false,
  add column identity_image text,
  add column identity_sha256 text,
  add column identity_removed_at timestamptz,
  add column identity_removed_by text,
  add constraint nda_signed_details_complete check (
    not signed_details or (
      coalesce(length(postal_address),0) between 5 and 600
      and signature_method is not null
      and coalesce(length(signature_name),0) between 1 and 120
      and (signature_method = 'typed' or jsonb_typeof(signature_strokes) = 'array')
      and identity_received and identity_sha256 ~ '^[a-f0-9]{64}$'
      and (identity_image is not null or identity_removed_at is not null)
    )
  ),
  add constraint nda_identity_image_size check (identity_image is null or length(identity_image) <= 2800000);
grant update(identity_image,identity_removed_at,identity_removed_by) on public.nufi_library_nda_acceptances to service_role;
comment on column public.nufi_library_nda_acceptances.identity_image is 'Private normalised WebP ID photo. Selected only for a signer or administrator explicitly opening the document; never included in normal access checks.';
comment on column public.nufi_library_nda_acceptances.signature_strokes is 'Bounded numeric stroke coordinates. Rendered as server-generated SVG, never supplied SVG markup.';
