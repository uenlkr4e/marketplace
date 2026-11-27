# Wix post-purchase suite: product spec & MVP plan

_Name: **Parcelback: Returns & Order Tracking** (checked 2026-11-27: not used on the Wix App Market, no matching EU/US trademark found in TMview; parcelback.app and .io were free, .com is taken). Drafted 2026-11-26._

## 1. Problem

After checkout, Wix Stores merchants have almost no tooling:

- **Order status:** customers only see tracking in the shipping email or on **My Orders**, which is **members-only** and does not show past orders placed as a guest. No branded tracking page exists, and there is no "where is my order?" lookup for guests.
- **Returns:** no customer-facing return or exchange flow exists. Refunds are started by the merchant only (exchanges exist only in POS). Merchants handle returns by email or contact form.
- **EU law (Directive (EU) 2023/2673, in force since June 2026):** online B2C sellers must offer a clearly labelled **"withdraw from contract" function**. It has to be available for the 14-day period, identify the contract, and confirm receipt on a durable medium (an email with date and time). Wix's own guidance points merchants to a contact form.

## 2. Evidence (from the 2026-11-26 app store scrape)

| | Shopify | Wix App Market |
|---|---|---|
| Returns & exchanges | Large category (Loop, ReturnGO, AfterShip Returns) | **8 apps; 7 have 0 reviews**, top has 8 |
| Order tracking / post-purchase | Large (AfterShip, ParcelPanel) | **13 apps**, top has 34 reviews |

Warning sign: AfterShip Returns and ReturnGO are already listed on Wix with **0 reviews**. Either demand is low or they haven't invested in Wix. **The validation step in §8 must settle this before the build.**

## 3. Product (MVP scope)

### A. Order lookup & tracking page (site page extension)
- Guest lookup by **order number + email**; members see their orders automatically.
- Shows the order timeline (paid → fulfilled → shipped → delivered) from Wix fulfilment data, with the carrier and tracking link.
- Branded using the merchant's logo and colours; can be added to the site menu.
- MVP shows the Wix fulfilment status plus the carrier link. **Live carrier scanning is v2** (it needs a paid tracking aggregator, see §6).

### B. Self-serve returns & exchanges portal (same page, "Start a return")
- Merchant rules: return window (days after fulfilment or delivery), eligible products or collections, final-sale tags, reasons list, photo upload required yes/no, refund vs. exchange vs. store credit.
- Customer picks items and quantities, a reason and a preferred resolution, then gets an RMA number and return instructions.
- Merchant dashboard: approve / reject / receive → **refund in one click** via the Wix refund API with optional restock and a customer email. Wix confirms the payment is refundable before offering the button.
- Exchanges in MVP are handled as "refund + new order link". True variant swaps are v2.

### C. EU withdrawal function
- A "Withdraw from contract here" link (footer or menu) that opens a short form with order lookup, then confirms immediately with a timestamped acknowledgement email.
- Applies automatically only to orders within the configurable 14-day window. Each request is logged with a full audit trail and exportable as CSV.
- Positioned as compliance support, **not legal advice**. Have an EU consumer-law reviewer check the flow and wording before launch.

### D. Thank-you page plugin
- A small "Track your order" and "Need to return something?" block in the thank-you page plugin slot, deep-linking to page A/B.

### Out of scope for MVP
Live carrier tracking, prepaid return labels, true exchanges, delay prediction, SMS/WhatsApp, multi-language beyond EN/ES/PT/DE/FR UI strings, Tiendanube port.

## 4. Verified Wix building blocks

| Need | Wix API / extension | Notes |
|---|---|---|
| Read fulfilments + tracking | `POST /ecom/v1/fulfillments/...`, `trackingInfo {trackingNumber, shippingProvider, trackingLink}` | Predefined carriers auto-generate links: fedex, ups, usps, dhl, canadaPost, hermes |
| React to shipping changes | Webhook **Order With Fulfillments Updated** (`wix.ecom.v1.fulfillments`) | Has an event `id` for deduplication |
| Check refundability | `POST /ecom/v1/order-billing/get-order-refundability` | Returns refundable / manuallyRefundable / nonRefundable plus reason |
| Refund | `POST /ecom/v1/order-billing/refund-payments` | Partial refunds, `sideEffects.restock`, `notifications.sendCustomerEmail`; permission scope **Manage Orders** |
| Customer-facing page | **Site page extension** (added via the App Dashboard) | Appears in site navigation |
| Thank-you page entry point | **Site plugin**, slots such as `thank-you-page:details:after` | Receives an `orderId` prop |
| Merchant UI | **Dashboard page** (React + Wix Design System) | |
| Billing | Wix built-in app billing | 100% revenue for 12 months, then 80/20; payout net-30 end of month, $200 minimum |

Still to confirm with a test app: order query and webhook coverage for **order created/paid/cancelled**, how a site page can securely call our backend for guest lookups, and whether Wix-hosted backend extensions can cover scheduled jobs (otherwise use a small self-hosted worker).

## 5. Architecture (MVP)

```
Wix site ── site page + thank-you plugin ──► our API (lookup, return request, withdrawal)
   │                                            │
   └─ webhooks (fulfilments, orders) ─────────► event handler (idempotent on event id)
                                                │
Wix dashboard page (merchant) ◄──────────────── Postgres: returns, RMAs, withdrawals, settings, audit log
                                                │
                                   Wix eCommerce APIs (orders, fulfilments, refunds)
                                   Email provider (acknowledgements, RMA emails)
```

- Multi-tenant per Wix site (instance id). Tokens stay server-side.
- Guest lookup: order number + email must both match. Rate-limit per IP and per site to prevent order enumeration.
- Store only what's needed (order id, line items, email hash where possible). Must support GDPR delete/anonymise events.
- Stack: TypeScript, Wix CLI app (dashboard and site extensions), Node backend, Postgres, a queue for webhooks and retries, a transactional email provider.

## 6. Pricing & unit economics

| Plan | Price | Includes |
|---|---|---|
| Free | $0 | Tracking page, EU withdrawal form, 10 returns/mo, "Powered by" badge |
| Starter | $9.99/mo | 100 returns/mo, rules engine, branding, CSV export |
| Growth | $24.99/mo | 500 returns/mo, one-click refunds with restock, store credit |
| Pro (v2) | $49+/mo | Live carrier tracking, prepaid return labels, unlimited returns |

- Comparable Shopify apps charge more, but Wix merchants are smaller. Start low and raise prices once there are reviews.
- **Main variable cost (v2): live tracking.** Aggregators such as AfterShip, 17TRACK and Ship24 charge per tracked shipment. Get quotes before pricing Pro, and keep live tracking out of Free/Starter.
- Target to recheck at 3 months: 150 paying merchants at an average of ~$15 ≈ $2.2k MRR. Wix keeps 0% in year 1.

## 7. Build plan

| Week | Deliverable |
|---|---|
| 0–2 | **Validation (§8) — go/no-go** |
| 2–3 | Wix dev account, test site with Wix Stores; prove fulfilments webhook, refundability check, refund + restock, site page and plugin |
| 3–5 | Lookup/tracking page, returns portal, merchant dashboard (rules, queue, refund) |
| 5–6 | EU withdrawal flow + acknowledgement emails, audit log; legal review of wording |
| 6–7 | Billing plans, onboarding wizard, App Market listing (screenshots, video, ES/DE/FR translations) |
| 7–8 | Submit for Wix review; recruit 5 beta merchants for first reviews |
| 9+ | v2 by demand: live tracking, return labels (Shippo/EasyPost), exchanges, Tiendanube port |

## 8. Validation before building (go/no-go)

1. Interview **10 Wix Stores merchants** (r/WIX, Wix Studio community forum, Wix-focused Facebook groups, Wix Partner agencies). Ask how they handle returns today, how many per month, whether they know about the EU withdrawal-button rule, and whether they would pay $10–25/mo.
2. Install AfterShip Returns and ReturnGO on a Wix test site and find out why they have 0 reviews. Weak product, or no demand?
3. **Go** if 3 or more merchants commit to a beta and at least half the interviewees handle 10+ returns per month. Otherwise switch to the Tiendanube SEO idea.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Wix builds returns natively | Move fast on reviews; go deeper on rules and EU compliance; port to Tiendanube to reduce single-platform risk |
| Low demand (small merchants, few returns) | §8 go/no-go; free tier drives installs and reviews |
| Legal liability from the EU flow | Present as a tool, not advice; legal review; merchant controls the wording |
| Order data privacy | Minimal storage, rate limiting, GDPR delete handling |
| API gaps (guest lookup security, scheduled jobs) | Prove them in weeks 2–3 before building the UI |

## 10. Sources

- Wix API docs: [Create Fulfillment](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/order-fulfillments/create-fulfillment), [Order With Fulfillments Updated](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/order-fulfillments/order-with-fulfillments-updated), [Get Order Refundability](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/order-billing/get-order-refundability), [Refund Payments](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/order-billing/refund-payments)
- Wix extensions: [Site page extension](https://dev.wix.com/docs/build-apps/develop-your-app/develop-an-app-with-the-cli/supported-extensions/site/site-pages/add-a-site-page-extension.md), [Thank-you page plugin slots](https://dev.wix.com/docs/build-apps/develop-your-app/extensions/site-extensions/site-plugins/supported-wix-app-pages/wix-e-commerce/wix-e-commerce-thank-you-page.md), [Extensions overview](https://dev.wix.com/docs/build-apps/develop-your-app/extensions/about-extensions)
- Wix billing: [About monetizing your app](https://dev.wix.com/docs/build-apps/launch-your-app/pricing-and-billing/about-monetizing-your-app)
- Current Wix customer experience: [Adding a tracking number](https://support.wix.com/en/article/wix-stores-adding-a-tracking-number-to-a-store-order), [Understanding order fulfillment](https://support.wix.com/en/article/wix-stores-understanding-order-fulfillment)
- App store data: `docs/data/wix_apps.csv`, `docs/data/tiendanube_apps.csv` (scraped 2026-11-26)
