-- ZenfulCove Kayaks — booking reference codes + per-kayak lockbox codes
-- Idempotent: safe to run more than once.

alter table public.kayaks add column if not exists lockbox_code text;

alter table public.bookings add column if not exists reference_code text;
create unique index if not exists bookings_reference_code_unique
  on public.bookings (reference_code)
  where reference_code is not null;
