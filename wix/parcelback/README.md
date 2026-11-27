# Parcelback: Returns & Order Tracking

Wix CLI app for order tracking, returns and the EU withdrawal function. Spec: `../../docs/wix-post-purchase-suite-spec.md`.

> Formerly "AfterBuy Ops". The Wix namespace `@uenlkr4e/after-buy-ops` and `projectId` in `wix.config.mjs` keep the old name: Wix doesn't allow changing them, and customers never see them.

## Architecture

```
Site widget (order-lookup)      ──►  POST /order-lookup, POST /return-request,       (customer; order number + email)
                                     POST /withdrawal
Dashboard page (Returns)        ──►  /merchant/returns, /merchant/return-action,     (Wix USER tokens only)
                                     /merchant/refund-plan, /merchant/refund
                                          │                 │
                                          ▼                 ▼
                              Neon Postgres (EU)     Wix eCommerce APIs (orders, fulfillments, refunds; elevated)
```

- **Backend code runs on Wix's hosting** (CLI HTTP endpoints). The only external service is the database.
- **Store isolation:** every query filters on the Wix app instance ID taken from the caller's token (`src/backend/caller.ts`). One store can never read another's returns.
- **Merchant endpoints** accept only `subjectType === 'USER'` (site owner or collaborators). Anonymous requests get 401 from Wix.
- **Status rules are enforced on the server** with atomic conditional updates (`transition()` in `src/backend/db.ts`). Refunds lock the request (`REFUNDING`) before calling the payment provider, so a double click can't refund twice; on failure the status is restored.
- **No Wix CMS needed** (the old data-collection extension was removed).

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

- **Eligibility** (`src/backend/returns.ts`): the order must be paid or partially refunded. The window is 30 days from the first shipment, or from the order date if nothing has shipped. Returnable quantity = ordered − refunded (per Wix) − quantities held by open requests.
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

## Setup

1. Permissions: Wix Stores **Read Orders** and **Manage Orders** (Wix Data permissions were removed).
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
```

**Chrome:** dashboard pages and the widget load from `http://localhost:5173`. Chrome asks whether manage.wix.com and the editor may access your local network; click **Allow**, or the page keeps spinning.

## Tested

**EU withdrawal (2026-11-27):**

- [x] Widget (editor preview, button switched on through the attribute): "Withdraw from contract here" → lookup of #10004 → name prefilled, item preselected → "Confirm withdrawal here" → `W10004-3` with timestamp; the order view then lists it as "Withdrawal … (Received)"
- [x] `withdrawal_received` reported without errors. The site automation "Withdrawal received: confirmation email" is active and exported as pre-installed.
- [x] Dashboard: badge, name, "Refund due by", reject warning; CSV export (6 rows × 15 columns, history included)
- [x] Editor widget settings: "EU withdrawal button" toggle (off by default) shows and hides the "Withdraw from contract here" link immediately
- [x] Acknowledgement email received in a real inbox with all details filled in

**Returns (2026-11-26, Neon backend):**


- [x] Widget: lookup, "Start a return", submit; the row lands in Neon with the right store ID and the widget shows "Requested"
- [x] Dashboard: list, Approve, Mark received through the merchant endpoints
- [x] Two refunds sent in parallel: one 200, one 409 ("already being refunded"); Wix shows a single −$80.00 refund and "Returned 1/1"; Neon history REQUESTED → APPROVED → RECEIVED → REFUNDING → REFUNDED
- [x] No token: 401 on customer and merchant endpoints; malformed request ID: 404
- [x] Earlier (still valid): wrong email / unknown order → same 404; tracking link; `fulfillments_updated` event

## Open items

- [ ] Merchant endpoints with a real anonymous **VISITOR** token (needs a published site). The editor-preview token tested was the owner's own USER token, which is allowed by design.
- [ ] Refund modal UI on a fresh request (its `/merchant/refund-plan` call wasn't exercised through the UI after the migration)
- [ ] Automatic card refund (needs an order paid through a refundable provider)
- [ ] Two simultaneous *requests* (returns or withdrawals) for the same items can both pass the quantity check (refunds are protected; requests aren't yet)
- [ ] EU withdrawal: legal review of the flow and wording; translated UI (DE/FR/ES…); a model withdrawal form link
- [ ] Rate limiting for public endpoints (Neon can hold the counters now)
- [ ] Settings page (return window, reasons), partial-quantity refunds, multi-payment orders, shipping refunds
- [ ] Rotate the Neon password (it was shared in a chat) and re-run `wix app env set`
- [ ] Thank-you page plugin slot isn't offered by `wix app generate` yet
