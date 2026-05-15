-- ZenfulCove Kayaks — simpler booking flow
-- Email becomes optional (cabin guests pay/contact in person).
-- Track which cabin they're staying at and when they accepted the waiver.
-- Idempotent.

alter table public.bookings alter column customer_email drop not null;
alter table public.bookings add column if not exists stay_location text;
alter table public.bookings add column if not exists waiver_accepted_at timestamptz;
