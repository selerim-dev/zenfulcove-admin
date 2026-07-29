# Add-On Purchases → Lodgify Booking Notes

When a guest pays for add-ons / special packages (birthday, anniversary, firewood, …) — whether right after booking or later during their stay — the purchase is automatically written into the **Booking Notes** section of their reservation in Lodgify, in **English and Spanish**, so the team sees every purchased service directly on the reservation.

## Where it happens

`lib/commerceFulfillment.ts` → `addLodgifyBookingNotesEntry()`, which runs inside `fulfillCommercePurchase()` after every successful Stripe payment for a commerce purchase. Fulfillment is triggered from both the Stripe webhook (`app/api/stripe/webhook/route.ts`) and the purchase confirmation page — a single-flight KV lock prevents double-sends, and a later retry completes any step that failed.

The note itself is written by `appendBookingNote()` in `lib/lodgify.js`:

1. `GET /v1/reservation/booking/{id}` — read the current admin `note` (the Booking Notes panel).
2. Append our block below whatever is already there (existing notes are never overwritten).
3. `PUT /v1/reservation/booking/{id}` with **only** `{ note }` in the body so no other booking fields are touched.

## Note format

```
==============================
ADD-ONS PURCHASED / COMPLEMENTOS COMPRADOS
Paid / Pagado: $185.00 (2026-07-28)

[EN]
- 1 x Birthday Package
  Includes a small birthday cake, bundle of roses, Happy Birthday sign on an easel, and a bouquet of balloons.
- 1 x Wood 2 Day Package
  A bundle of wood that will last for a 2-night stay.
Please have all purchased items ready for this reservation.

[ES]
- 1 x Paquete de Cumpleaños
  Incluye un pastel pequeño de cumpleaños, un ramo de rosas, un letrero de "Happy Birthday" en caballete y un ramo de globos.
- 1 x Paquete de Leña — 2 días
  Un paquete de leña suficiente para una estancia de 2 noches.
Por favor tengan listos todos los artículos comprados para esta reservación.

Purchase / Compra: <purchase uuid>
==============================
```

- Item lines always include the quantity.
- English descriptions come from the current product catalog (`listCommerceProducts`).
- Spanish titles/descriptions for the five launch packages are curated in `PACKAGE_SPANISH` (keyed by `packageProductIdentity`, so admin edits to titles/SKUs still match). Custom products fall back to their English title/description in the Spanish section — add new entries to `PACKAGE_SPANISH` when adding permanent products.

## Idempotency & failure handling

- `lodgify_booking_note_added_at` on the purchase record (KV) marks success; retries skip.
- The purchase UUID inside the block is a marker: if a crash happens after the Lodgify write but before the KV update, the retry sees the marker in the existing notes and does not append a duplicate.
- On failure the error is stored in `fulfillment_error`, and the team email reports `Lodgify booking notes: not updated (<reason>)`. The customer email, team email, and Owner-message steps still run.
- Public `/shop` purchases have no reservation and are skipped (same as the existing Owner-message step).

## Relationship to the existing "Lodgify note"

The older `addLodgifySetupNote` step still sends an **Owner message** into the booking's message thread (subject "Paid special package purchase - setup needed"). That is unchanged. This feature additionally puts the summary where housekeeping actually looks: the reservation's Booking Notes panel.

## Testing / verification

`app/api/lodgify-booking-note-test/route.js` (admin/CRON-secret protected):

- `GET ?list=1&from=YYYY-MM-DD&to=YYYY-MM-DD` — list booking ids in a stay range (to pick an old test booking).
- `GET ?bookingId=…` — snapshot of the booking incl. current note.
- `POST {"bookingId": "…"}` — appends a clearly-marked test block, re-reads the booking, reports `fieldDrift` (any non-note field that changed — must be empty), then **restores the original note**. Pass `"keep": true` to leave the test note in place.
- `POST {"mode": "set", "bookingId": "…", "value": "…"}` — overwrite the note verbatim (cleanup helper).

### Verified in production (2026-07-28, booking 21275565)

- Appending with `PUT {note}` only: works, and `fieldDrift` was empty both runs — status, dates, guest, people, rooms/key codes, and amounts were untouched by the partial PUT.
- Appending below an existing note preserves the prior content exactly.
- Restoring a previous non-empty note works verbatim.
- **Caveat:** Lodgify *ignores* empty/blank `note` values on this PUT — a note can be replaced but not cleared to `""` via the API. Irrelevant for this feature (we only append non-empty blocks), but the reason the `set` cleanup mode writes `" "` to blank a note.
