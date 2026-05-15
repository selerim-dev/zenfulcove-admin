-- ZenfulCove Kayaks — add kayak length (in feet)
-- Idempotent: safe to run more than once.

alter table public.kayaks
  add column if not exists length_feet int check (length_feet is null or length_feet > 0);
