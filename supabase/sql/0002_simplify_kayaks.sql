-- ZenfulCove Kayaks — schema simplification
-- Drop description and hourly pricing; add a color column for the public UI.
-- Idempotent: safe to run more than once.

alter table public.kayaks drop column if exists description;
alter table public.kayaks drop column if exists hourly_rate_cents;
alter table public.kayaks
  add column if not exists color text not null default '#2563eb';
