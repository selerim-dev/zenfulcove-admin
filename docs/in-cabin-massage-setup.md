# In-Cabin Massage — Go-Live Setup

The feature is code-complete and the database is migrated. It stays **hidden from
guests** behind an admin feature flag until you turn it on. What's left is a
Google credential (blocked right now by an org policy), plugging a few values in,
one test pass, and flipping the flag.

---

## Part 1 — For the Google Workspace / Cloud admin (forward this section)

You need the **Organization Policy Administrator** role (`roles/orgpolicy.policyAdmin`)
at the organization level — i.e., a Google Workspace super admin. Steps:

### A. Allow service-account key creation (this is the current blocker)
An org policy `iam.disableServiceAccountKeyCreation` is blocking key creation.
Override it **for one project only** (don't weaken the whole org):

1. Go to https://console.cloud.google.com and select (or create) a project for
   this — e.g. "Zenfulcove Scheduling".
2. **IAM & Admin → Organization Policies**.
3. Search **"Disable service account key creation"** (`iam.disableServiceAccountKeyCreation`).
4. **Manage policy** → scope to **this project** → set **Enforcement: Off**
   (Not enforced) → **Save**. Wait ~1–2 minutes.

   CLI alternative (same role required):
   ```
   gcloud resource-manager org-policies disable-enforce \
     iam.disableServiceAccountKeyCreation --project=YOUR_PROJECT_ID
   ```

### B. Enable the Calendar API
5. **APIs & Services → Library** → search **"Google Calendar API"** → **Enable**.

### C. Create the service account + key
6. **APIs & Services → Credentials → Create credentials → Service account** →
   name it (e.g. `zenfulcove-spa`) → Create → Done.
7. Open the service account → **Keys → Add key → Create new key → JSON** →
   download (this now succeeds because of step A).

### D. Send back two values (treat the JSON like a password)
From the downloaded JSON file, securely share:
- `client_email`  → e.g. `zenfulcove-spa@your-project.iam.gserviceaccount.com`
- `private_key`   → the long `-----BEGIN PRIVATE KEY-----\n…` string

> The service account needs **no IAM role** for the calendar — calendar access is
> granted by *sharing the calendar* (next step), not by a role.

### E. Share the therapist's calendar with the service account
In **Beth's** Google Calendar → Settings → her calendar → **Share with specific
people** → add the `client_email` from step D → permission **"Make changes to
events"** → Save. (Whoever manages Beth's calendar does this; it's separate from
the org-admin work above.)

---

## Part 2 — What we do once we have those two values

1. Add to **Vercel** (Settings → Environment Variables, Production + Preview) and
   to local `.env.local`, then redeploy:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = the `client_email`
   - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` = the `private_key` (paste exactly, with
     the `\n` escapes — the app converts them)
2. In **Admin → In-Cabin Massage** (`/admin/spa`):
   - Set Beth's **mobile number** (for the request texts)
   - Set her **Google Calendar ID** (usually her calendar's email address)
   - Set **working hours**, slot interval, buffer, lead time
   - Confirm **service prices** ($175 / $245) and **flat payouts** (defaults
     $100 / $140 — adjust to the real agreement)
3. Confirm shared infra already used by other features: **Stripe** mode
   (`KAYAK_STRIPE_MODE` test vs live) and the **Twilio** from-number.
4. Confirm the Vercel plan allows the `*/5` expiry cron (`/api/cron/spa-expiry`).
5. **Test end-to-end in Stripe test mode** (book → pay → Beth's SMS → Accept and
   Decline paths).
6. **Flip the feature flag ON**: Admin → Settings → "Choose which links guests
   see" → check **In-Cabin Massage**.

---

## How it works (runtime)

1. Guest opens the portal → **In-Cabin Massage** → picks a service + date.
2. The system reads Beth's **Google Calendar free/busy** over her **working
   hours** and shows **only open slots** (anything she's busy with disappears).
3. Guest pays in full via **Stripe**.
4. Beth gets a **text with Accept / Decline links** and **30 minutes** to respond.
   - **Accept** → booking confirmed, the appointment is **auto-added to her Google
     Calendar**, and the guest is notified.
   - **Decline or no response in 30 min** → guest is **auto-refunded** and asked to
     pick another time.
5. **No double-bookings**: guarded both by Google free/busy and a database
   exclusion constraint.
6. **Payouts**: the admin bookings table shows the flat amount owed per completed
   service; you pay Beth outside the system and mark it paid. No invoicing or
   commission tracking.
7. **Adding therapists later**: same guest experience — the system routes to the
   active provider; multi-therapist routing can be layered on without changing the
   booking flow.
