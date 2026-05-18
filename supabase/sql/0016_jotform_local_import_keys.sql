-- External import keys for copying historical Jotform submissions into local
-- form submissions without duplicating the same Jotform submission on reruns.

alter table public.local_form_submissions
  add column if not exists external_source text;

alter table public.local_form_submissions
  add column if not exists external_form_id text;

alter table public.local_form_submissions
  add column if not exists external_submission_id text;

create unique index if not exists local_form_submissions_external_unique
  on public.local_form_submissions (
    external_source,
    external_form_id,
    external_submission_id
  )
  where external_source is not null
    and external_source <> ''
    and external_form_id is not null
    and external_form_id <> ''
    and external_submission_id is not null
    and external_submission_id <> '';
