alter table public.nufi_library_nda_acceptances drop constraint nda_signed_details_complete;
alter table public.nufi_library_nda_acceptances add constraint nda_signed_details_complete check (
  not signed_details or (
    coalesce(length(postal_address),0) between 5 and 600
    and signature_method is not null
    and coalesce(length(signature_name),0) between 1 and 120
    and coalesce(signature_method = 'typed' or jsonb_typeof(signature_strokes) = 'array', false)
    and identity_received and identity_sha256 is not null
    and identity_sha256 ~ '^[a-f0-9]{64}$'
    and (identity_image is not null or identity_removed_at is not null)
  )
);
create function public.nufi_validate_nda_receipt() returns trigger language plpgsql security invoker set search_path = '' as $$
declare document public.nufi_library_nda_agreements%rowtype;
begin
  select * into document from public.nufi_library_nda_agreements where version=new.agreement_version and active;
  if not found or document.document_hash is distinct from new.document_hash or document.document_text is distinct from new.document_text then
    raise exception 'The current agreement must be read before signing.';
  end if;
  if document.requires_identity and not new.signed_details then
    raise exception 'Address, signature and identity details are required.';
  end if;
  return new;
end;
$$;
revoke all on function public.nufi_validate_nda_receipt() from public, anon, authenticated;
grant execute on function public.nufi_validate_nda_receipt() to service_role;
create trigger nufi_validate_nda_receipt before insert on public.nufi_library_nda_acceptances for each row execute function public.nufi_validate_nda_receipt();
