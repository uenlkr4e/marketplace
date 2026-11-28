# Parcelback: Returns & Order Tracking

Wix CLI app for order tracking, returns and the EU withdrawal function. Spec: `../../docs/wix-post-purchase-suite-spec.md`.

> Formerly "AfterBuy Ops". The Wix namespace `@uenlkr4e/after-buy-ops` and `projectId` in `wix.config.mjs` keep the old name: Wix doesn't allow changing them, and customers never see them.

## Architecture

```
Site widget (order-lookup)      ──►  POST /order-lookup, POST /return-request,       (customer; order number + email)
                                     POST /withdrawal
Dashboard pages (Returns,       ──►  /merchant/returns, /merchant/return-action,     (Wix USER tokens only)
  Settings)                          /merchant/refund-plan, /merchant/refund,
                                     /merchant/settings
                                          │                 │
                                          ▼                 ▼
                              Neon Postgres (EU)     Wix eCommerce APIs (orders, fulfillments, refunds; elevated)
```

- **Backend code runs on Wix's hosting** (CLI HTTP endpoints). The only external service is the database.
- **Store isolation:** every query filters on the Wix app instance ID taken from the caller's token (`src/backend/caller.ts`). One store can never read another's returns.
- **Merchant endpoints** accept only `subjectType === 'USER'` (site owner or collaborators). Anonymous requests get 401 from Wix.
- **Status rules are enforced on the server** with atomic conditional updates (`transition()` in `src/backend/db.ts`). Refunds lock the request (`REFUNDING`) before calling the payment provider, so a double click can't refund twice; on failure the status is restored.
- **No Wix CMS needed** (the old data-collection extension was removed).
- **Rate limits** (`src/backend/limits.ts`, `rate_limits` table) on the public endpoints. Blocked calls get 429 with `Retry-After` and code `rate_limited`, which the widget translates.
  - 30 calls per client per 10 minutes.
  - 10 failed lookups (wrong order number or email) per client per hour.
  - 200 failed lookups per store per hour, to stop guessing spread over many visitors.
  - A client is the IP address if the platform forwards one, else the Wix visitor ID. In dev no IP header reaches the app, so it's the visitor ID. Keys are SHA-256 hashes, so no IPs are stored.
- **Deletion on uninstall** (`src/extensions/backend/events/app-removed/`): Wix's "app instance removed" event deletes the store's requests, settings and order locks (`deleteStoreData` in `src/backend/db.ts`), as the privacy policy promises. Needs the **Manage Your App** permission. For deletion requests sent to support: `npm run db:delete-store -- <instanceId>`.
- **Per-order lock** (`withOrderLock` in `src/backend/db.ts`, `order_locks` table): return and withdrawal requests re-read existing requests, check quantities and insert while holding a lock on the order. A second request waits up to about 3 seconds, then gets 409 `order_busy`. Locks expire after 30 seconds if a request dies while holding one.

## Customer emails (Wix Automations)

Emails are sent **by Wix, as the store**. There's no email provider or domain to manage, and merchants can edit the wording in Wix Automations.

| Event | Trigger key | Reported from |
|---|---|---|
| Return requested | `return_requested` | `POST /return-request` |
| Return approved | `return_approved` | `POST /merchant/return-action` (approve) |
| Return rejected | `return_rejected` | `POST /merchant/return-action` (reject; a reason is required and sent as `merchant_note`) |
| Withdrawal received | `withdrawal_received` | `POST /withdrawal` (the EU acknowledgement with date and time) |
| Refunded | none | Wix's own refund email (`sendCustomerEmail` on refund) |

- The triggers are configured in the app dashboard under **Develop → Automations**. The three return triggers share one payload: `contact_id` (UUID marked `identityType: contact`, so the automation can email that contact), `rma_number`, `order_number`, `items_summary`, `reason`, `merchant_note`, `requested_at`.
- `withdrawal_received` has its own payload: `contact_id`, `reference`, `order_number`, `customer_name`, `items_summary`, `customer_note`, `submitted_at` (e.g. "27 November 2026 at 14:07 UTC").
- `src/backend/notify.ts` reports events with `activations.reportEvent`. It's best effort (a failure is logged, never blocks the return) and idempotent per request + event.
- Permission: **Set Up Automations** (`SCOPE.CRM.SETUP-AUTOMATIONS`).
- The buyer's Wix contact ID is stored in `return_requests.contact_id`.
- Email wording and remaining setup steps (templates, approved/rejected automations, export as pre-installed): `docs/customer-emails.md`.

## Returns flow

```
REQUESTED ── approve ──► APPROVED ── receive ──► RECEIVED
    └── reject ──► REJECTED          └──────── refund ───────┴──► REFUNDING ──► REFUNDED
```

- **Eligibility** (`src/backend/returns.ts`): the store must accept returns, and the order must be paid or partially refunded. The window (30 days by default) runs from the first shipment, or from the order date if nothing has shipped. Returnable quantity = ordered − refunded (per Wix) − quantities held by open requests.
- **Settings page** (`store_settings` table, `src/shared/settings.ts`): accept returns on/off, return window (1–365 days), return reasons (any of the six built-in ones, which the widget translates, plus up to five custom ones shown as typed). Stores that never saved settings get the defaults. The server validates the same rules as the dashboard, and `/return-request` only accepts the store's current reasons. - **Final sale products** (`final_sale_products` in `store_settings`):
  - Merchants pick products with a search on the Settings page (`GET /merchant/products?q=`, `src/backend/catalog.ts`). It works on both Wix Stores catalog V1 and V3; the dev site is V3.
  - Matching line items (`catalogReference.catalogItemId`) can't be returned, and the widget labels them "Final sale" (translated).
  - If only final-sale items are left, the widget says so (`final_sale_only`).
  - Withdrawals ignore the list: EU law doesn't exempt "final sale", so the merchant rejects exempt goods case by case.
- **Refund:**
  - If the provider can refund the payment: automatic refund to the original payment method.
  - Otherwise (e.g. offline payments): the refund is recorded in Wix (`externalRefund`) and the merchant sends the money themselves.
  - Optional restock and customer email in both cases.

## EU withdrawal function

Directive (EU) 2023/2673 requires online stores selling to EU consumers to offer a "withdraw from contract" function. Parcelback provides it as an option of the order lookup widget. This is compliance support, not legal advice.

- **Opt-in:** widget settings → **EU withdrawal button** (widget prop `withdrawal-button`). Off by default, so non-EU stores don't show it.
- **Customer flow:**
  1. "Withdraw from contract here" on the lookup form (or on the order view).
  2. Order number + email identify the order.
  3. The customer confirms their name and the items (everything open is preselected) and can add a comment. No reason is asked for.
  4. "Confirm withdrawal here" leads to a confirmation screen with the reference (`W<order>-<n>`), date and time, and items. The `withdrawal_received` email repeats the same details.
- **Storage:** same `return_requests` table with `kind = 'WITHDRAWAL'` and `customer_name`. Withdrawals hold their quantities like returns, and the merchant handles them in the same queue (approve → receive → refund).
- **Period** (`checkWithdrawal` in `src/backend/returns.ts`): open until the order is fulfilled. After that, 14 days + 7 days delivery buffer from the last shipment (or from the order date if it was marked fulfilled without a shipment). Wix has no delivery date, so the buffer errs on the customer's side. Cancelled or fully refunded orders can't be withdrawn from. No payment is required.
- **Dashboard:**
  - Withdrawals get a "Withdrawal" badge, the customer's name and a "Refund due by" date (14 days after the declaration).
  - Rejecting one shows a warning that only an ended period or exempt goods justify it.
  - **Export CSV** downloads all requests with their status history as the audit trail.

## Languages

The site widget is translated into **English, German, French, Spanish, Italian, Dutch and (European) Portuguese** (`src/extensions/site/widgets/order-lookup/i18n.ts`).

- **Choosing the language:** the widget setting **Language** defaults to *Site language (automatic)*, which follows the site's `<html lang>` and then the visitor's browser. Unsupported languages fall back to English. Merchants can also pin a language.
- **Server messages:** customer-facing errors and eligibility messages carry a `code` (e.g. `order_not_found`, `withdrawal_period_ended`). The widget translates the code and falls back to the English `error` text.
- **Return reasons:** the values stay English, because that's what is stored and shown to the merchant. Only the labels are translated.
- **Heading:** an empty heading shows "Track your order" in the widget's language. A custom heading is shown as typed.
- **Not translated yet:** the dashboard (merchant-facing, English) and the customer emails. Merchants edit the emails in Wix Automations, so per-language versions are up to them for now.
- The withdrawal button labels are meant to match each language version of the directive. **Check them against the official texts in the legal review.**

## Setup

1. Permissions:
   - Wix Stores **Read Orders** and **Manage Orders**.
   - **Manage Your App**, for the "app removed" event that deletes a store's data.
   - **Read Products** (catalog V1), **Read products in v3 catalog** and **Read v3 catalog (PII)** (catalog version check) for the final-sale picker. Added 2026-11-27; sites with an older version installed must approve them when they update.
   - Wix Data permissions were removed.
2. Database: Neon Postgres, `eu-central-1`.
   - The connection string is a Wix secret: `npx wix app env set --key DATABASE_URL --value "<url>"`, then `npx wix app env pull`. It's written to `.env.local`, which git ignores.
   - Schema: `db/schema.sql`. Apply it with `npm run db:migrate`, which is safe to re-run.
3. Dev sites:
   - Main (selected): `d9e0c629-befa-405f-8c0e-92cf81ea75cf`. Its old test return `R10001-1` lived in that site's CMS and was not migrated (test data only).
   - Second: `8c620127-4db6-4665-8fa5-5c83cc6a0743`. Order #10001 (Round Eyeglasses, `nocms.buyer@example.com`) was returned and refunded through Neon as `R10001-1`.
   - Switch with `npx wix app dev-site select <id>`.
4. Tunneling consent: `wix app dev consent-tunneling true`.

## Run

```bash
npm run dev          # dev server; Wix reaches the backend through a secure tunnel
npm run typecheck
npm run build
npm run db:migrate   # apply db/schema.sql to DATABASE_URL
npm run db:delete-store -- <instanceId>   # delete one store's data (support requests)
```

**Chrome:** dashboard pages and the widget load from `http://localhost:5173`. Chrome asks whether manage.wix.com and the editor may access your local network; click **Allow**, or the page keeps spinning.

## Tested

**Store credit (2026-11-28, `wix app dev`, main dev site):**

- [x] Refund dialog → "Store credit (single-use discount code)" on R10002-1 ($119): 200, request CREDITED, coupon `CR10002-1-VEQL` created in Wix (read back with the Coupons API: usage limit 1, $119 off, stores scope, our app ID), 12-month expiry stored
- [x] Order page shows "Store credit issued" with the code, amount and expiry
- [x] Withdrawals: the dialog doesn't offer store credit and the endpoint refuses it (EU: refund with the same means of payment)
- [ ] The coupon doesn't appear in the site's Coupons list (filter shows nothing either), though the API returns it. Redeeming the code at checkout is untested: test on the demo site's shop after release.
- [ ] That first coupon was created with Wix's default `limitedToOneItem: true` (discount capped at the cheapest item); fixed afterwards by setting it to false, not yet re-tested
- [ ] "Store credit issued" trigger created (key `store_credit_issued`); no pre-installed email for it yet

**Return instructions and per-item restock (2026-11-28, `wix app dev`, main dev site):**

- [x] Settings → Return instructions saved and kept after a reload (`return_instructions` column added with `npm run db:migrate`)
- [x] Order #10003 with an approved return (R10003-1): the order page shows "How to send it back" with the instructions, line breaks kept
- [x] Refund dialog lists each returned item under "Put back in stock"; recorded R10003-1's refund with the vase left out of stock (`restockItems: [{ quantity: 0 }]`, 200, request REFUNDED)

**Member orders (2026-11-28, `wix app dev`, main dev site preview):**

- [x] Visitor: `/my-orders` answers `{"member":false,"orders":[]}` and the plain form shows
- [x] Guest lookup of #10004 with its email still works
- [x] Order number without an email from a non-member: `400 invalid_customer` (the server only drops the email for the member's own orders)
- [ ] Logged-in member: order list, one-click lookup, return and withdrawal without an email. Editor preview doesn't send a member token, so test this on the demo site after the next release.

**EU withdrawal (2026-11-27):**

- [x] Widget (editor preview, button switched on through the attribute): "Withdraw from contract here" → lookup of #10004 → name prefilled, item preselected → "Confirm withdrawal here" → `W10004-3` with timestamp; the order view then lists it as "Withdrawal … (Received)"
- [x] `withdrawal_received` reported without errors. The site automation "Withdrawal received: confirmation email" is active and exported as pre-installed.
- [x] Dashboard: badge, name, "Refund due by", reject warning; CSV export (6 rows × 15 columns, history included)
- [x] Editor widget settings: "EU withdrawal button" toggle (off by default) shows and hides the "Withdraw from contract here" link immediately
- [x] Acknowledgement email received in a real inbox with all details filled in

**Returns table layout (2026-11-27):** at a 1280 px browser width the Customer column overflowed into Items and status badges were cut off. Fixed with percentage column widths, the order number under the reference, the amount under the status and stacked action buttons; checked at 1280 and 1500 px.

**Deletion on uninstall (2026-11-27):**

- [x] `deleteStoreData` on the second dev site's store (after uninstalling the app there): its request and settings were deleted; a second run deleted nothing; the main dev site's data was untouched
- [x] `npm run db:delete-store` rejects a malformed ID and reports what it deleted
- [x] **The event itself (2026-11-28, version 1.0.0):** installed the released version on the second dev site, saved settings through the hosted backend, uninstalled from the Editor: the store's `store_settings` row was deleted by the event; the main dev site's data was untouched. (It does not reach `wix app dev` or `wix app preview`; only released versions get it.)

**Final sale products (2026-11-27):**

- [x] Product search on the dev site (catalog V3): "cer", "Ceramic", "Vase" find Ceramic Flower Vase; "round" finds Round Eyeglasses
- [x] Marked Ceramic Flower Vase as final sale, saved, reloaded: the lookup of #10003 shows "Ceramic Flower Vase × 1 · Final sale" and `finalSale: true`
- [x] Eligibility, tested directly: in a mixed order only the normal items can be returned; with only final-sale items left the code is `final_sale_only`; withdrawal still includes final-sale items
- [x] Dev site restored to no final-sale products
- [ ] Catalog V1 path (needs a V1 store)

**Rate limits and order lock (2026-11-27):**

- [x] 10 wrong-email lookups gave 404; the 11th gave 429 `rate_limited` with Retry-After, and the widget showed the message
- [x] Lock test against Neon: three overlapping jobs ran one after another; a waiter blocked for more than ~3 s got `OrderBusyError`
- [x] With a lock held on #10003, a return request waited, then got 409 `order_busy` (shown in German). After release, the same request reached the eligibility check and left no lock behind.
- [ ] On a published site: check whether an IP header reaches the app (if not, limits fall back to the visitor ID, and the per-store limit carries the load)

**Settings page (2026-11-27):**

- [x] Defaults load for a store without saved settings; a window of 0 is rejected (Save disabled); duplicate custom reasons are rejected regardless of case
- [x] Saved 14 days, "Other" off, custom "Arrived too late": survives a reload; the lookup response has the new reasons and a window of order date + 14 days; the German form translates the built-in reasons and shows the custom one as typed
- [x] Accept returns off: the widget shows "This store doesn't accept returns online" (code `returns_disabled`)
- [x] Dev site restored to the defaults afterwards

**Languages (2026-11-27):**

- [x] German in the editor: form, translated "order not found" error from its code, order view (statuses, fulfillment status, "nothing left" message, dates as 27.11.2026)
- [x] French: order view, return form (reasons, quantities), withdrawal form (rendered with sample data, not submitted)
- [x] Editor settings: Language dropdown switches the widget immediately; left on automatic

**Returns (2026-11-26, Neon backend):**


- [x] Widget: lookup, "Start a return", submit; the row lands in Neon with the right store ID and the widget shows "Requested"
- [x] Dashboard: list, Approve, Mark received through the merchant endpoints
- [x] Two refunds sent in parallel: one 200, one 409 ("already being refunded"); Wix shows a single −$80.00 refund and "Returned 1/1"; Neon history REQUESTED → APPROVED → RECEIVED → REFUNDING → REFUNDED
- [x] No token: 401 on customer and merchant endpoints; malformed request ID: 404
- [x] Earlier (still valid): wrong email / unknown order → same 404; tracking link; `fulfillments_updated` event

## Open items

- [x] Merchant endpoints with a real anonymous visitor token (2026-11-28, published demo site on 1.0.0): `/merchant/returns`, `/merchant/settings` and `/merchant/return-action` all answer 403 "Not allowed."; the visitor's order lookup works.
- [ ] Refund modal UI on a fresh request (its `/merchant/refund-plan` call wasn't exercised through the UI after the migration)
- [ ] Automatic card refund (needs an order paid through a refundable provider)
- [ ] EU withdrawal: legal review of the flow and wording (including the translated button labels); a model withdrawal form link
- [ ] Translations were written without a native-speaker review; customer emails and the dashboard are English only
- [ ] Partial-quantity refunds, multi-payment orders, shipping refunds
- [ ] Rotate the Neon password (it was shared in a chat) and re-run `wix app env set`
- [ ] Thank-you page plugin slot isn't offered by `wix app generate` yet
