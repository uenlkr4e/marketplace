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

1. **Fill in the placeholders** in `privacy.html` and `terms.html`: `[OPERATOR NAME]`, `[POSTAL ADDRESS]`, `[COUNTRY]`. GDPR requires the operator's identity and contact address.
2. **Domain:** the pages use `parcelback.app` for the email addresses (hello@, support@, privacy@). If you register another domain, replace it everywhere: `grep -rl parcelback.app site/`.
3. **Deletion after uninstall:** the privacy policy promises deleting a store's data within 30 days of uninstalling. The app doesn't do this yet; build it (Wix "app removed" event → delete the store's rows) before launch.
4. Have the privacy policy and terms checked as part of the legal review.

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
