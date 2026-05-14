# Supabase setup

Use `supabase/zenfulcove_full_schema.sql` for a fresh Supabase project when you want one pasteable SQL script.

Do not run the all-in-one file and then also run every file in `supabase/sql` against the same empty database. They contain the same schema in two formats:

- `supabase/zenfulcove_full_schema.sql`: one query for the Supabase SQL editor.
- `supabase/sql/*.sql`: ordered migrations for incremental changes.

## Dashboard field mapping

In the Supabase project dashboard:

- Project URL goes in `NEXT_PUBLIC_SUPABASE_URL`.
- Publishable key goes in `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Secret key, or the legacy `service_role` key, goes in `SUPABASE_SERVICE_ROLE_KEY`.
- Direct connection string goes in `DATABASE_URL` only when running migrations locally.

For local development, put those values in `.env.local`. For production/preview deployments, add them in Vercel project environment variables.

## Local migration option

If `DATABASE_URL` is set locally and `psql` is installed, the full schema can be applied with:

```bash
psql "$DATABASE_URL" -f supabase/zenfulcove_full_schema.sql
```

The direct connection string has a `[YOUR-PASSWORD]` placeholder in Supabase. Replace it with the database password before running the command.
