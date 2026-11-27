# App Market listing: Parcelback

Assets and copy for the Wix App Market listing. Wix rules followed: no "Wix" in the teaser, features or description; images 4:3 and at least 1,200 × 900; icon 1,000 × 1,000, solid background, no text.

## Files

| File | Where it goes | Spec |
|---|---|---|
| `app-icon.png` | App Profile → App Info → App icon | 1000 × 1000, 24-bit PNG; Wix rounds the corners |
| `listing-1-main.jpg` | App Profile → Media → main image (first) | 1600 × 1200: app name, tagline, brand visual |
| `listing-2-customer.jpg` | Media, image 2 | Customer order page (tracking, returns, withdrawal) |
| `listing-3-queue.jpg` | Media, image 3 | Returns queue in the dashboard |
| `listing-4-withdrawal.jpg` | Media, image 4 | EU withdrawal form (German) and button labels |
| `listing-5-settings.jpg` | Media, image 5 | Settings page |
| `promo-banner.jpg` | Media → promotional banner (optional) | 540 × 360, illustration only: Wix wants no text or logo here |

The images are rendered from the HTML templates in `src/` (written by `src/generate.py`, same look as parcelback.app). Screenshots come from `site/img/`; customer screens use sample orders, dashboard screens are the dev site with sample customer names.

To re-render after a change: run `python docs/app-market/src/generate.py`, then `python docs/app-market/src/inline.py <temp folder>` (self-contained copies that open from disk), and screenshot each page at its exact size. Keep the icon as PNG and the rest as JPG (quality 90).

## Status (2026-11-27)

- [x] App Info: name, teaser, four features, full description, terms URL and icon saved
- [x] Media: the five listing images (in order) and the promotional banner saved
- [x] Company Info (2026-11-28): listed as an individual, Shane Ulker; Parcelback icon as logo; street-level address (Selçuk, Hacı Bekir Sokak, Selçuklu/Konya, Türkiye); website and privacy policy links
- [x] Contact Info (2026-11-28): support@parcelback.app for support, billing and urgent (split later once billing@ and urgent@ forward); phone +90 554 385 2295
- [x] Get Found (2026-11-28): category Sell Online; keywords returns, order tracking, refunds, returns portal, EU withdrawal
- [x] Pricing (2026-11-28): Free (beta)
- [ ] Security & Privacy: answers filled in but not saved; Wix requires the owner to tick the confirmation box. Draft answers: access protected Yes; data Encrypted (TLS in transit, Neon encrypts at rest); cloud Yes, Amazon Web Services (Neon, Frankfurt); sells data No; complaints No; breaches No; DPO No
- [x] Version 1.0.0 released (2026-11-28) with `wix app release --version-type major`. Not yet submitted for review or distributed.
- [x] Automation triggers published to English users (2026-11-28). End-to-end test on 1.0.0 (second dev site): order #10002 → return R10002-1 through the widget → "Return requested: confirmation email" ran (Total triggered: 1, run Ended, no errors). The automations list still labels the trigger "Trigger not available"; that label is stale. All four triggers then published to all users (2026-11-28, can't be reverted).
- [x] Uninstall deletion verified on 1.0.0 (see wix/parcelback/README.md)
- [x] Security & Privacy confirmed and saved by the owner (2026-11-28)
- [x] Demo site (2026-11-28): https://dev-sitex-1776621954.wix-development-sites.org/ (second dev site, version 1.0.0, order lookup widget with the EU withdrawal button on). Set in App Info.
- [x] Demo order for reviewers: **#10003**, email **demo@parcelback.app** (Round Eyeglasses + Baseball Cap, paid, DHL tracking 00340434161094042557). Return and withdrawal are both open until late December 2026; recreate the order after that.
- [x] demo@parcelback.app is forwarded (all @parcelback.app addresses forward)
- [ ] Widget styling fixed in code (dark primary buttons, outlined secondary, 16px base text; checked on the live demo site by injecting the CSS). **Needs a release** (1.1.0) to reach stores.

**Note for Wix reviewers** (paste into the submission notes):

> Demo site: https://dev-sitex-1776621954.wix-development-sites.org/ . On the home page, look up order **10003** with email **demo@parcelback.app** to see tracking, start a return, or use the EU withdrawal button. Requests then appear in the dashboard under Apps → Parcelback → Returns, where they can be approved, rejected or refunded. Settings (return window, reasons, final-sale products) are under Apps → Parcelback → Settings.

## Listing text

**App name** (30 max): Parcelback: Returns & Tracking

**Teaser** (48 max): Self-serve returns, refunds & order tracking

**Features**

1. Order tracking page for customers, no account needed
2. Self-serve returns with your window, reasons and final-sale rules
3. Approve, reject and refund in one click, with restock
4. EU withdrawal button and customer page in 7 languages

**Full description** (1,200 max):

> Parcelback gives your store a self-serve returns process and an order tracking page that customers can use without creating an account.
>
> Customers enter their order number and email to see their items, shipments and tracking links. To send something back, they choose the items and a reason and get a return number right away.
>
> You handle every request in one dashboard: approve it, or reject it with a reason the customer sees, mark the items as received, then refund in one click with optional restock. Payments that can't be refunded automatically are recorded for you.
>
> Set your own return window and reasons, and mark products as final sale. Customers get an email from your store at every step, and you can edit the wording.
>
> Selling to customers in the EU? Turn on the withdrawal button for the EU's online withdrawal requirement. Customers confirm in two steps and get a timestamped confirmation on screen and by email. The customer page is available in English, German, French, Spanish, Italian, Dutch and Portuguese.

**Terms & conditions URL:** https://parcelback.app/terms

**Privacy policy URL** (Company Info): https://parcelback.app/privacy

**Support / billing / urgent:** support@parcelback.app for now. To split them, add billing@ and urgent@ in Cloudflare Email Routing first, then update Contact Info.

**Search keywords** (5): returns, order tracking, refunds, returns portal, EU withdrawal

**Category:** the eCommerce / store management category closest to "returns" in the Get Found page.

**Demo site:** needs a published Wix site with the app installed. Not set yet; publish a demo store (for example the main dev site) once the first version is released.
