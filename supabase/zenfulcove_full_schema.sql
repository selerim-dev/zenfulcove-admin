-- ZenfulCove unified app full Supabase schema
-- Generated from supabase/sql/0001_init.sql through the latest numbered migration.
-- Use this for a fresh project when you want one pasteable SQL script.
-- Do not run this and then also run the numbered files against the same empty database.
-- ============================================================================
-- Source: supabase/sql/0001_init.sql
-- ============================================================================
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

-- ============================================================================
-- Source: supabase/sql/0002_simplify_kayaks.sql
-- ============================================================================
-- ZenfulCove Kayaks — schema simplification
-- Drop description and hourly pricing; add a color column for the public UI.
-- Idempotent: safe to run more than once.

alter table public.kayaks drop column if exists description;
alter table public.kayaks drop column if exists hourly_rate_cents;
alter table public.kayaks
  add column if not exists color text not null default '#2563eb';

-- ============================================================================
-- Source: supabase/sql/0003_add_length.sql
-- ============================================================================
-- ZenfulCove Kayaks — add kayak length (in feet)
-- Idempotent: safe to run more than once.

alter table public.kayaks
  add column if not exists length_feet int check (length_feet is null or length_feet > 0);

-- ============================================================================
-- Source: supabase/sql/0004_add_code.sql
-- ============================================================================
-- ZenfulCove Kayaks — add a tracking code per kayak
-- Idempotent: safe to run more than once.

alter table public.kayaks add column if not exists code text;

create unique index if not exists kayaks_code_unique
  on public.kayaks (code)
  where code is not null;

-- ============================================================================
-- Source: supabase/sql/0005_simplify_bookings.sql
-- ============================================================================
-- ZenfulCove Kayaks — simpler booking flow
-- Email becomes optional (cabin guests pay/contact in person).
-- Track which cabin they're staying at and when they accepted the waiver.
-- Idempotent.

alter table public.bookings alter column customer_email drop not null;
alter table public.bookings add column if not exists stay_location text;
alter table public.bookings add column if not exists waiver_accepted_at timestamptz;

-- ============================================================================
-- Source: supabase/sql/0006_add_codes.sql
-- ============================================================================
-- ZenfulCove Kayaks — booking reference codes + per-kayak lockbox codes
-- Idempotent: safe to run more than once.

alter table public.kayaks add column if not exists lockbox_code text;

alter table public.bookings add column if not exists reference_code text;
create unique index if not exists bookings_reference_code_unique
  on public.bookings (reference_code)
  where reference_code is not null;

-- ============================================================================
-- Source: supabase/sql/0007_drop_lockbox_code.sql
-- ============================================================================
-- ZenfulCove Kayaks — drop the unused lockbox_code column
-- The existing public.kayaks.code field is the lockbox code, so the separate
-- column added in 0006 is redundant.
-- Idempotent: safe to run more than once.

alter table public.kayaks drop column if exists lockbox_code;

-- ============================================================================
-- Source: supabase/sql/0008_lodgify_reservation.sql
-- ============================================================================
-- ZenfulCove Kayaks — link bookings to Lodgify reservations
-- Idempotent: safe to run more than once.

alter table public.bookings
  add column if not exists lodgify_reservation_id text;

alter table public.bookings
  add column if not exists is_complimentary boolean not null default false;

create index if not exists bookings_lodgify_reservation_idx
  on public.bookings (lodgify_reservation_id);

-- ============================================================================
-- Source: supabase/sql/0009_kayak_images.sql
-- ============================================================================
-- ZenfulCove Kayaks — kayak photo URLs
-- Idempotent: safe to run more than once.

alter table public.kayaks add column if not exists image_url text;

-- ============================================================================
-- Source: supabase/sql/0010_admin_operations.sql
-- ============================================================================
-- ZenfulCove unified app — admin operations tables
-- Creates Supabase destinations for current admin KV/file state without
-- deleting or rewriting the production Upstash data.

create extension if not exists "pgcrypto";

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- Harden broad kayak policies from the initial kayak app. Public kayak reads
-- remain available through the existing "kayaks read public" policy.
drop policy if exists "kayaks admin all" on public.kayaks;
create policy "kayaks admin all"
  on public.kayaks for all
  to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "bookings admin all" on public.bookings;
create policy "bookings admin all"
  on public.bookings for all
  to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "profiles admin read" on public.profiles;
create policy "profiles admin read"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id bigserial primary key,
  source text not null default 'manual',
  status text not null default 'pending',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.automation_logs (
  id bigserial primary key,
  run_id bigint references public.automation_runs(id) on delete set null,
  timestamp timestamptz not null default now(),
  automation text not null default '',
  property text not null default '',
  action text not null default '',
  status text not null default 'info',
  payload jsonb not null default '{}'::jsonb
);

create index if not exists automation_logs_timestamp_idx
  on public.automation_logs (timestamp desc);
create index if not exists automation_logs_run_idx
  on public.automation_logs (run_id);

create table if not exists public.sms_threads (
  id uuid primary key default gen_random_uuid(),
  twilio_number text not null,
  contact_phone text not null,
  last_message_at timestamptz,
  last_message_preview text not null default '',
  last_message_direction text not null default 'in'
    check (last_message_direction in ('in', 'out')),
  unread_count int not null default 0 check (unread_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (twilio_number, contact_phone)
);

create index if not exists sms_threads_twilio_last_idx
  on public.sms_threads (twilio_number, last_message_at desc);
create index if not exists sms_threads_last_idx
  on public.sms_threads (last_message_at desc);

create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.sms_threads(id) on delete cascade,
  twilio_number text not null,
  contact_phone text not null,
  direction text not null check (direction in ('in', 'out')),
  body text not null default '',
  twilio_sid text,
  status text not null default '',
  message_timestamp timestamptz not null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sms_messages_thread_time_idx
  on public.sms_messages (thread_id, message_timestamp);
create index if not exists sms_messages_pair_time_idx
  on public.sms_messages (twilio_number, contact_phone, message_timestamp);
create unique index if not exists sms_messages_twilio_sid_unique
  on public.sms_messages (twilio_sid)
  where twilio_sid is not null and twilio_sid <> '';

create table if not exists public.sms_seen_sids (
  sid text primary key,
  twilio_number text not null,
  contact_phone text not null,
  first_seen_at timestamptz not null default now()
);

create table if not exists public.event_popup_contacts (
  contact_key text primary key,
  state jsonb not null default '{}'::jsonb,
  first_seen_date date,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.event_popup_sms_sends (
  contact_key text not null,
  followup_id text not null,
  state jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (contact_key, followup_id)
);

create table if not exists public.salesmate_sync_state (
  source_list_id text not null,
  contact_key text not null,
  state jsonb not null default '{}'::jsonb,
  synced_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (source_list_id, contact_key)
);

drop trigger if exists app_settings_touch_updated_at on public.app_settings;
create trigger app_settings_touch_updated_at
  before update on public.app_settings
  for each row execute function public.touch_updated_at();

drop trigger if exists sms_threads_touch_updated_at on public.sms_threads;
create trigger sms_threads_touch_updated_at
  before update on public.sms_threads
  for each row execute function public.touch_updated_at();

drop trigger if exists event_popup_contacts_touch_updated_at on public.event_popup_contacts;
create trigger event_popup_contacts_touch_updated_at
  before update on public.event_popup_contacts
  for each row execute function public.touch_updated_at();

drop trigger if exists event_popup_sms_sends_touch_updated_at on public.event_popup_sms_sends;
create trigger event_popup_sms_sends_touch_updated_at
  before update on public.event_popup_sms_sends
  for each row execute function public.touch_updated_at();

drop trigger if exists salesmate_sync_state_touch_updated_at on public.salesmate_sync_state;
create trigger salesmate_sync_state_touch_updated_at
  before update on public.salesmate_sync_state
  for each row execute function public.touch_updated_at();

alter table public.app_settings enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_logs enable row level security;
alter table public.sms_threads enable row level security;
alter table public.sms_messages enable row level security;
alter table public.sms_seen_sids enable row level security;
alter table public.event_popup_contacts enable row level security;
alter table public.event_popup_sms_sends enable row level security;
alter table public.salesmate_sync_state enable row level security;

drop policy if exists "app_settings admin all" on public.app_settings;
create policy "app_settings admin all" on public.app_settings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "automation_runs admin all" on public.automation_runs;
create policy "automation_runs admin all" on public.automation_runs
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "automation_logs admin all" on public.automation_logs;
create policy "automation_logs admin all" on public.automation_logs
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sms_threads admin all" on public.sms_threads;
create policy "sms_threads admin all" on public.sms_threads
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sms_messages admin all" on public.sms_messages;
create policy "sms_messages admin all" on public.sms_messages
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sms_seen_sids admin all" on public.sms_seen_sids;
create policy "sms_seen_sids admin all" on public.sms_seen_sids
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "event_popup_contacts admin all" on public.event_popup_contacts;
create policy "event_popup_contacts admin all" on public.event_popup_contacts
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "event_popup_sms_sends admin all" on public.event_popup_sms_sends;
create policy "event_popup_sms_sends admin all" on public.event_popup_sms_sends
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "salesmate_sync_state admin all" on public.salesmate_sync_state;
create policy "salesmate_sync_state admin all" on public.salesmate_sync_state
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- Source: supabase/sql/0011_kayak_images_storage.sql
-- ============================================================================
-- ZenfulCove unified app — kayak image storage
-- Creates the public bucket expected by the kayak admin image upload flow.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'kayak-images',
  'kayak-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "kayak images public read" on storage.objects;
create policy "kayak images public read"
  on storage.objects for select
  using (bucket_id = 'kayak-images');

drop policy if exists "kayak images admin write" on storage.objects;
create policy "kayak images admin write"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'kayak-images' and public.is_admin())
  with check (bucket_id = 'kayak-images' and public.is_admin());

-- ============================================================================
-- Source: supabase/sql/0012_local_forms.sql
-- ============================================================================
-- Local form definitions and submissions.
-- This is the in-house replacement path for Jotform, but Jotform remains
-- supported while migration is in progress.

create table if not exists public.local_forms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  schema jsonb not null default '{"fields":[]}'::jsonb,
  is_active boolean not null default true,
  sendgrid_contact_list_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.local_form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid references public.local_forms(id) on delete set null,
  form_slug text not null,
  email text,
  first_name text,
  last_name text,
  phone text,
  booking_code text,
  source text not null default 'local',
  payload jsonb not null default '{}'::jsonb,
  sendgrid_synced_at timestamptz,
  submitted_at timestamptz not null default now()
);

create index if not exists local_forms_slug_idx
  on public.local_forms (slug);

create index if not exists local_form_submissions_form_slug_idx
  on public.local_form_submissions (form_slug, submitted_at desc);

create index if not exists local_form_submissions_email_idx
  on public.local_form_submissions (lower(email))
  where email is not null and email <> '';

create index if not exists local_form_submissions_unsynced_idx
  on public.local_form_submissions (submitted_at desc)
  where sendgrid_synced_at is null;

drop trigger if exists local_forms_touch_updated_at on public.local_forms;
create trigger local_forms_touch_updated_at
  before update on public.local_forms
  for each row execute function public.touch_updated_at();

alter table public.local_forms enable row level security;
alter table public.local_form_submissions enable row level security;

drop policy if exists "local forms admin all" on public.local_forms;
create policy "local forms admin all"
  on public.local_forms for all
  to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "local form submissions admin all" on public.local_form_submissions;
create policy "local form submissions admin all"
  on public.local_form_submissions for all
  to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.local_forms (slug, name, description, schema, is_active)
values (
  'guest-info',
  'Guest Information',
  'Share the details needed for your stay.',
  '{
    "submitLabel": "Submit",
    "successMessage": "Thanks. We received your information.",
    "fields": [
      { "name": "firstName", "label": "First Name", "type": "text", "required": true },
      { "name": "lastName", "label": "Last Name", "type": "text", "required": true },
      { "name": "email", "label": "Email", "type": "email", "required": true },
      { "name": "phone", "label": "Phone", "type": "tel", "required": false },
      { "name": "bookingCode", "label": "Booking Code", "type": "text", "required": false }
    ]
  }'::jsonb,
  true
)
on conflict (slug) do nothing;

