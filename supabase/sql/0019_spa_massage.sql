-- ZenfulCove — In-Cabin Massage ("Elevate Your Stay")
-- Therapists, services, and massage bookings. Bookings reuse the same race-safe
-- GiST overlap guard the kayak bookings use (see 0001_init.sql no_kayak_overlap).
-- Idempotent.

create extension if not exists "btree_gist";

-- ---------------------------------------------------------------------------
-- therapists (Beth for v1; schema is multi-therapist ready)
-- ---------------------------------------------------------------------------
create table if not exists public.massage_therapists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  google_calendar_id text,
  timezone text not null default 'America/Chicago',
  -- weekly_hours: { "0": [["10:00","19:00"]], ... } keyed by JS getDay() (0=Sun)
  weekly_hours jsonb not null default '{}'::jsonb,
  slot_interval_min int not null default 30 check (slot_interval_min between 5 and 240),
  buffer_min int not null default 30 check (buffer_min >= 0),
  lead_time_hours int not null default 12 check (lead_time_hours >= 0),
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- services (60 / 90 minute massages for v1)
-- ---------------------------------------------------------------------------
create table if not exists public.massage_services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration_min int not null check (duration_min > 0),
  price_cents int not null check (price_cents >= 0),
  payout_cents int not null default 0 check (payout_cents >= 0),
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.massage_booking_status as enum (
    'pending_payment',
    'pending_therapist',
    'confirmed',
    'declined',
    'expired',
    'cancelled',
    'completed'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.massage_bookings (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.massage_therapists(id) on delete restrict,
  service_id uuid references public.massage_services(id) on delete set null,
  lodgify_reservation_id text not null,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  stay_location text,
  service_label text not null,
  duration_min int not null check (duration_min > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  amount_cents int not null check (amount_cents >= 0),
  payout_cents int not null default 0 check (payout_cents >= 0),
  status public.massage_booking_status not null default 'pending_payment',
  therapist_deadline timestamptz,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  refund_id text,
  google_event_id text,
  payout_paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint massage_bookings_time_range check (ends_at > starts_at)
);

-- Block the slot the moment a request is live (pending therarpist response),
-- through confirmation/completion. pending_payment is intentionally excluded so
-- abandoned checkouts don't hold a slot; the rare double-pay race is caught when
-- the webhook tries to flip the second booking to pending_therapist.
alter table public.massage_bookings drop constraint if exists no_therapist_overlap;
alter table public.massage_bookings
  add constraint no_therapist_overlap
  exclude using gist (
    therapist_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending_therapist', 'confirmed', 'completed'));

create index if not exists massage_bookings_therapist_starts_idx
  on public.massage_bookings (therapist_id, starts_at);
create index if not exists massage_bookings_status_idx
  on public.massage_bookings (status);
create index if not exists massage_bookings_reservation_idx
  on public.massage_bookings (lodgify_reservation_id);
create index if not exists massage_bookings_deadline_idx
  on public.massage_bookings (therapist_deadline)
  where status = 'pending_therapist';

-- Lock these tables to server-side (service-role) access only, matching the rest
-- of the schema. The app reads/writes exclusively through the service-role admin
-- client, which bypasses RLS; the anon/authenticated keys get no access (no
-- policies), so guests can't touch these tables directly.
alter table public.massage_therapists enable row level security;
alter table public.massage_services enable row level security;
alter table public.massage_bookings enable row level security;

-- ---------------------------------------------------------------------------
-- seed: one therapist (Bodywork by Beth) + two services
-- ---------------------------------------------------------------------------
insert into public.massage_therapists (name, weekly_hours, display_order)
select
  'Bodywork by Beth',
  '{"0":[["10:00","18:00"]],"1":[["10:00","19:00"]],"2":[["10:00","19:00"]],"3":[["10:00","19:00"]],"4":[["10:00","19:00"]],"5":[["10:00","19:00"]],"6":[["10:00","18:00"]]}'::jsonb,
  10
where not exists (select 1 from public.massage_therapists);

insert into public.massage_services (name, duration_min, price_cents, payout_cents, display_order)
select * from (values
  ('60-Minute Massage', 60, 17500, 10000, 10),
  ('90-Minute Massage', 90, 24500, 14000, 20)
) as s(name, duration_min, price_cents, payout_cents, display_order)
where not exists (select 1 from public.massage_services);
