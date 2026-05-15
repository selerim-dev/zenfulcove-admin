-- Stripe checkout hardening for paid customer-portal rentals.
-- Idempotent: safe to run more than once.

create unique index if not exists bookings_stripe_checkout_session_unique
  on public.bookings (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null and stripe_checkout_session_id <> '';

-- Enforce one included/complimentary rental per Lodgify reservation at the
-- database layer. If this fails, resolve duplicate complimentary rows first.
create unique index if not exists bookings_one_complimentary_per_reservation
  on public.bookings (lodgify_reservation_id)
  where lodgify_reservation_id is not null
    and lodgify_reservation_id <> ''
    and is_complimentary = true
    and status in ('pending', 'confirmed', 'completed');
