-- Kayak Stripe product mapping.
-- Keep pricing in Zenfulcove Admin, but attach paid Checkout line items to
-- existing Stripe Products for reporting.
-- Idempotent: safe to run more than once.

alter table public.kayaks
  add column if not exists stripe_product_id text;

alter table public.kayaks
  drop constraint if exists kayaks_stripe_product_id_format;
alter table public.kayaks
  add constraint kayaks_stripe_product_id_format
  check (
    stripe_product_id is null
    or stripe_product_id ~ '^prod_[A-Za-z0-9]+$'
  );

create unique index if not exists kayaks_stripe_product_id_unique
  on public.kayaks (stripe_product_id)
  where stripe_product_id is not null and stripe_product_id <> '';

update public.kayaks
set stripe_product_id = case
  when name in ('Rental #5', 'Kayak Rental #5', 'Kayak Rental 5 (Tandon Kayak)') then 'prod_UYmr6G1FKSYLFY'
  when name in ('Rental #6', 'Kayak Rental #6') then 'prod_UZRWaFBoBoT1MW'
  when name in ('Rental #7', 'Kayak Rental #7') then 'prod_UZRz0zjADNRsNc'
  when name in ('Rental #8', 'Kayak Rental #8', 'Kayak rental #8') then 'prod_UZRcJhulu8YYzD'
  when name in ('Rental #9', 'Kayak Rental #9') then 'prod_UZRd57eSxHtXuI'
  else stripe_product_id
end
where name in (
  'Rental #5',
  'Kayak Rental #5',
  'Kayak Rental 5 (Tandon Kayak)',
  'Rental #6',
  'Kayak Rental #6',
  'Rental #7',
  'Kayak Rental #7',
  'Rental #8',
  'Kayak Rental #8',
  'Kayak rental #8',
  'Rental #9',
  'Kayak Rental #9'
);
