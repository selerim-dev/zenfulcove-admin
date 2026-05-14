-- ZenfulCove Kayaks — add a tracking code per kayak
-- Idempotent: safe to run more than once.

alter table public.kayaks add column if not exists code text;

create unique index if not exists kayaks_code_unique
  on public.kayaks (code)
  where code is not null;
