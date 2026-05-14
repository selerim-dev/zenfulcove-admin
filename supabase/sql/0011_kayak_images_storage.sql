-- ZenfulCove unified app — kayak image storage
-- Creates the public bucket expected by the kayak admin image upload flow.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'kayak-images',
  'kayak-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "kayak images public read" on storage.objects;
create policy "kayak images public read"
  on storage.objects for select
  using (bucket_id = 'kayak-images');

drop policy if exists "kayak images admin write" on storage.objects;
create policy "kayak images admin write"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'kayak-images' and public.is_admin())
  with check (bucket_id = 'kayak-images' and public.is_admin());
