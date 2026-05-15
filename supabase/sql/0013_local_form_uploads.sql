-- Local form upload storage.
-- Runtime code also creates this bucket if it is missing, but the schema file
-- keeps fresh Supabase setup complete and reviewable.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'local-form-uploads',
  'local-form-uploads',
  false,
  5242880,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "local form uploads admin read" on storage.objects;
create policy "local form uploads admin read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'local-form-uploads' and public.is_admin());
