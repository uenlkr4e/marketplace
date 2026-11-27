# Parcelback: Returns & Order Tracking

Wix CLI app for order tracking, returns and the EU withdrawal function. Spec: `../../docs/wix-post-purchase-suite-spec.md`.

> Formerly "AfterBuy Ops". The Wix namespace `@uenlkr4e/after-buy-ops` and `projectId` in `wix.config.mjs` keep the old name: Wix doesn't allow changing them, and customers never see them.

## Architecture

```
Site widget (order-lookup)      ──►  POST /order-lookup, POST /return-request        (customer; order number + email)
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
| Refunded | none | Wix's own refund email (`sendCustomerEmail` on refund) |

- The triggers are configured in the app dashboard under **Develop → Automations**. They share one payload: `contact_id` (UUID marked `identityType: contact`, so the automation can email that contact), `rma_number`, `order_number`, `items_summary`, `reason`, `merchant_note`, `requested_at`.
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

## Tested (2026-11-26, Neon backend)

- [x] Widget: lookup, "Start a return", submit; the row lands in Neon with the right store ID and the widget shows "Requested"
- [x] Dashboard: list, Approve, Mark received through the merchant endpoints
- [x] Two refunds sent in parallel: one 200, one 409 ("already being refunded"); Wix shows a single −$80.00 refund and "Returned 1/1"; Neon history REQUESTED → APPROVED → RECEIVED → REFUNDING → REFUNDED
- [x] No token: 401 on customer and merchant endpoints; malformed request ID: 404
- [x] Earlier (still valid): wrong email / unknown order → same 404; tracking link; `fulfillments_updated` event

## Open items

- [ ] Merchant endpoints with a real anonymous **VISITOR** token (needs a published site). The editor-preview token tested was the owner's own USER token, which is allowed by design.
- [ ] Refund modal UI on a fresh request (its `/merchant/refund-plan` call wasn't exercised through the UI after the migration)
- [ ] Automatic card refund (needs an order paid through a refundable provider)
- [ ] Customer emails for request received, approved and rejected (Resend free tier); only Wix's refund email is sent today
- [ ] Two simultaneous *requests* for the same items can both pass the quantity check (refunds are protected; requests aren't yet)
- [ ] Rate limiting for public endpoints (Neon can hold the counters now)
- [ ] Settings page (return window, reasons), partial-quantity refunds, multi-payment orders, shipping refunds
- [ ] Rotate the Neon password (it was shared in a chat) and re-run `wix app env set`
- [ ] Thank-you page plugin slot isn't offered by `wix app generate` yet
