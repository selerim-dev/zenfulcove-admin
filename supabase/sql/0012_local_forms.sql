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
