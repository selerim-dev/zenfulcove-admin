-- ZenfulCove Kayaks — initial schema
-- Run this in the Supabase SQL editor (or via supabase CLI) after creating the project.

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type public.booking_status as enum (
      'pending',
      'confirmed',
      'cancelled',
      'completed'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- kayaks (the rentable fleet — single property, fixed inventory)
-- ---------------------------------------------------------------------------
create table if not exists public.kayaks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  capacity int not null default 1 check (capacity between 1 and 6),
  hourly_rate_cents int not null check (hourly_rate_cents >= 0),
  daily_rate_cents int not null check (daily_rate_cents >= 0),
  is_active bool not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  kayak_id uuid not null references public.kayaks(id) on delete restrict,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  rate_type text not null check (rate_type in ('hourly', 'daily')),
  amount_cents int not null check (amount_cents >= 0),
  status public.booking_status not null default 'pending',
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_time_range check (ends_at > starts_at)
);

-- prevent overlapping bookings on the same kayak (only for live bookings)
alter table public.bookings drop constraint if exists no_kayak_overlap;
alter table public.bookings
  add constraint no_kayak_overlap
  exclude using gist (
    kayak_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed', 'completed'));

create index if not exists bookings_kayak_starts_idx
  on public.bookings (kayak_id, starts_at);
create index if not exists bookings_status_idx
  on public.bookings (status);

-- ---------------------------------------------------------------------------
-- profiles (admins only — guests don't have accounts)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

-- auto-insert a profile row when a Supabase auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at trigger for bookings
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bookings_touch_updated_at on public.bookings;
create trigger bookings_touch_updated_at
  before update on public.bookings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.kayaks enable row level security;
alter table public.bookings enable row level security;
alter table public.profiles enable row level security;

-- public can list active kayaks (so the booking page can render with anon key)
drop policy if exists "kayaks read public" on public.kayaks;
create policy "kayaks read public"
  on public.kayaks for select
  using (is_active = true);

-- authenticated admins: full access
drop policy if exists "kayaks admin all" on public.kayaks;
create policy "kayaks admin all"
  on public.kayaks for all
  to authenticated
  using (true) with check (true);

-- bookings: writes from public go through server routes (service role).
-- authenticated admins can read/write everything.
drop policy if exists "bookings admin all" on public.bookings;
create policy "bookings admin all"
  on public.bookings for all
  to authenticated
  using (true) with check (true);

-- profiles: a user can read their own row
drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- seed helpers (commented — run manually once you have a fleet)
-- ---------------------------------------------------------------------------
-- insert into public.kayaks (name, description, capacity, hourly_rate_cents, daily_rate_cents, display_order)
-- values
--   ('Solo Cove', 'Lightweight single-paddler kayak.', 1, 2500, 8000, 1),
--   ('Tandem Heron', 'Two-person kayak for friends or family.', 2, 4000, 12000, 2);
