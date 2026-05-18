-- Access code release state for stay check-in codes.
-- Codes are ingested from an external provider such as Jervis, or supplied by
-- a configured property-code fallback, then released exactly once after the
-- configured check-in-day release time.

create table if not exists public.access_code_releases (
  booking_id text primary key,
  property_id text,
  property_name text,
  guest_email text,
  guest_name text,
  checkin_date date,
  access_code text,
  source text not null default 'unknown',
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'blocked')),
  channel text not null default 'email',
  sendgrid_template_id text,
  sent_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists access_code_releases_checkin_idx
  on public.access_code_releases (checkin_date, status);

create index if not exists access_code_releases_guest_email_idx
  on public.access_code_releases (lower(guest_email))
  where guest_email is not null and guest_email <> '';

drop trigger if exists access_code_releases_touch_updated_at
  on public.access_code_releases;
create trigger access_code_releases_touch_updated_at
  before update on public.access_code_releases
  for each row execute function public.touch_updated_at();

alter table public.access_code_releases enable row level security;

drop policy if exists "access code releases admin all"
  on public.access_code_releases;
create policy "access code releases admin all"
  on public.access_code_releases for all
  to authenticated
  using (public.is_admin()) with check (public.is_admin());
