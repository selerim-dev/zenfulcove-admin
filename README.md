# Zenfulcove Glamping Admin Dashboard

Automation dashboard for Zenfulcove Glamping. Manages vacancy promo emails and waiver reminders via a daily cron job.

## Stack

- **Next.js** (App Router)
- **Tailwind CSS** (v4)
- **Vercel** deployment
- **No database** — config stored in `config/automations.js`, logs in `logs/activity.json`

## Setup

### 1. Install dependencies

```bash
cd zenfulcove-admin
npm install
```

### 2. Add API keys

Copy `.env.local` and fill in your keys:

```
LODGIFY_API_KEY=your_lodgify_key
JOTFORM_API_KEY=your_jotform_key
SENDGRID_API_KEY=your_sendgrid_key
CRON_SECRET=a_random_secret_string
```

### 3. Update config placeholders

Open `config/automations.js` and replace all `REPLACE_ME` values:

- **SendGrid template IDs** — Create dynamic templates in SendGrid and paste IDs
- **JotForm form ID** — Your waiver form ID from JotForm

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the admin dashboard.

### 5. Test the cron locally

```bash
curl -X POST http://localhost:3000/api/cron \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Deploy to Vercel

1. Push this repo to GitHub
2. Import in [Vercel](https://vercel.com)
3. Add the [Upstash Redis](https://vercel.com/integrations/upstash) integration (config is stored in KV)
4. Add environment variables in Vercel project settings:
   - `LODGIFY_API_KEY`
   - `JOTFORM_API_KEY`
   - `SENDGRID_API_KEY`
   - `CRON_SECRET`
   - Upstash KV adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically
   - **Do not set** `CRON_DRY_RUN` (or set it to `false`) — production sends real emails
5. Vercel runs the cron daily at **8 AM CST** (configured in `vercel.json`)

## File Structure

```
/app
  /api
    /cron/route.js      — Daily cron job (vacancy emails + waiver reminders)
    /logs/route.js      — GET activity logs
    /config/route.js    — GET/POST automation config
  /page.js              — Admin dashboard (client component)
  /layout.js            — Root layout with Google Fonts
  /globals.css          — Tailwind config + brand tokens
/config
  automations.js        — Single source of truth for automation settings
  keys.js               — Environment variable exports (server-only)
/lib
  lodgify.js            — Lodgify API client
  jotform.js            — JotForm API client
  sendgrid.js           — SendGrid email sender
/logs
  activity.json         — Append-only activity log
tailwind.config.js      — Brand colors and fonts
vercel.json             — Vercel cron schedule
```

## Automations

### Vacancy Promo Emails
Uses the **SendGrid contact list** (from Settings). Checks Lodgify availability 30 days out. If a vacant period starts in exactly 7, 4, or 2 days, sends the corresponding SendGrid template to all contacts in the list.

### Jotform Waiver Emails (no contact list)
1. **Lodgify** → Get bookings with check-in on target dates (2 days before, 1 day before, day of).
2. **Jotform** → Fetch all waiver form submissions once per run.
3. **Cross-reference** → For each Lodgify guest: if they've submitted the waiver (booking ID in Jotform), skip. If not, send the reminder email to the Lodgify guest email.
4. Recipients come from Lodgify guest emails only — **not** the SendGrid contact list (that’s for vacancy promos).

### Add-On Purchases → Lodgify Booking Notes
When a guest pays for add-ons / special packages (during booking or after confirmation), the purchase — item names, quantities, and details — is automatically appended to the reservation's **Booking Notes** in Lodgify, in English **and** Spanish, alongside the existing Owner message + team/customer emails. See [docs/addon-booking-notes.md](docs/addon-booking-notes.md).

## Notes

- All API keys are server-side only (never exposed to client)
- Dashboard is an internal tool — no auth required
- Config updates are written directly to `config/automations.js`
- Logs are stored in `logs/activity.json` (append-only)
