-- ZenfulCove Kayaks — drop the unused lockbox_code column
-- The existing public.kayaks.code field is the lockbox code, so the separate
-- column added in 0006 is redundant.
-- Idempotent: safe to run more than once.

alter table public.kayaks drop column if exists lockbox_code;
