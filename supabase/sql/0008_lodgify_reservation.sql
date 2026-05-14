-- ZenfulCove Kayaks — link bookings to Lodgify reservations
-- Idempotent: safe to run more than once.

alter table public.bookings
  add column if not exists lodgify_reservation_id text;

alter table public.bookings
  add column if not exists is_complimentary boolean not null default false;

create index if not exists bookings_lodgify_reservation_idx
  on public.bookings (lodgify_reservation_id);
