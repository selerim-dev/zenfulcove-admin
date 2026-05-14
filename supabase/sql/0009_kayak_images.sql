-- ZenfulCove Kayaks — kayak photo URLs
-- Idempotent: safe to run more than once.

alter table public.kayaks add column if not exists image_url text;
