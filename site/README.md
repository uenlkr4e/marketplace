# parcelback.app website

Static site for Parcelback: landing page, privacy policy, terms of use, support/FAQ and a 404 page. Plain HTML and CSS, no build step, no JavaScript, no cookies, no third-party requests (fonts are self-hosted).

| File | Page |
|---|---|
| `index.html` | Landing page (`/`) |
| `privacy.html` | Privacy policy (`/privacy`) |
| `terms.html` | Terms of use (`/terms`) |
| `support.html` | Support and FAQ (`/support`) |
| `404.html` | Not found |
| `styles.css`, `fonts/`, `favicon.svg` | Shared design |
| `_headers` | Security headers for Cloudflare Pages |

## Before publishing

1. ~~Operator details~~ filled in (Shane Ulker, full postal address in Selcuklu/Konya, Turkey), 2026-11-27.
2. ~~Domain~~ `parcelback.app` is registered, deployed on Cloudflare Pages, and hello@, support@ and privacy@ forward to the owner's inbox.
3. ~~Deletion after uninstall~~ built (app-removed event + `npm run db:delete-store`); the event still needs a check after the first release.
4. Have the privacy policy and terms checked as part of the legal review. Points for the reviewer: the operator is based in Turkey and serves EU stores, so check whether an EU representative is needed (GDPR Art. 27) and how Turkish data protection law (KVKK) applies.

## Deploy on Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → this repository.
2. Build command: *(none)*. Build output directory: `site`.
3. **Custom domains** → add `parcelback.app` (and `www`).
4. **Email Routing** (on the domain) → forward `hello@`, `support@`, `privacy@`, plus a billing and an urgent address for the Wix listing, to your inbox.

Cloudflare serves `privacy.html` at `/privacy` automatically, which is how the pages link to each other.

## Preview locally

```bash
python -m http.server 8080 --directory site
```

Locally, open `/privacy.html` etc. directly; the clean URLs (`/privacy`) only work on Cloudflare.
