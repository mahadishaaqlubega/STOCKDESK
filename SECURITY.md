# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in StockDesk, please report it responsibly. **Do not open a public GitHub issue.**

Instead, please email: **security@stockdesk.app** (or the maintainer's private email)

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response Timeline

- **Acknowledgment:** within 48 hours
- **Initial assessment:** within 1 week
- **Fix or mitigation:** critical issues within 2 weeks

## Scope

This policy covers the StockDesk application code in this repository. It does not cover:

- Third-party dependencies (report upstream)
- Infrastructure issues (Railway, Vercel — report to those platforms)
- Social engineering attacks

## Supported Versions

| Version | Supported |
|---|---|
| Latest main | Yes |
| Older releases | No |

## How StockDesk protects accounts and data

- **Shop isolation:** every query is scoped to the signed-in user's shop;
  records of another shop answer 404. Covered by the end-to-end checks.
- **Passwords:** bcrypt hashes. One server-side rule everywhere a password
  is set: 8+ characters with a letter, a number and a symbol, at most 72
  bytes (`backend/src/utils/password.js`).
- **Sessions:** JWT (HS256 only), 8 h by default, refreshed while in use.
  Each user has a `tokenVersion`; a password change, an admin reset, an email
  reset or "Sign out on all devices" bumps it and ends every older session.
  The user is re-loaded on every request, so role changes and removed
  accounts take effect immediately.
- **Brute force:** per-IP limits on sign-in, sign-up, email, password-reset
  and verification endpoints, plus a per-account lockout (10 wrong passwords
  → 15 minutes; an email reset lifts it). Every API route also has a
  backstop limit (600 requests a minute per session or IP). Behind
  Cloudflare the visitor's address comes from `CF-Connecting-IP`, believed
  only when the request really arrives from a Cloudflare address
  (`backend/src/utils/clientIp.js`).
- **Reset links:** only a SHA-256 hash of each password-reset token is
  stored, so a leaked database or backup cannot reset passwords.
- **Input:** exact-match lookups escape LIKE wildcards; request bodies are
  limited to 3 MB; logos must be PNG/JPEG/WebP or https; ids are validated.
  Every SQL query passes values as bound parameters.
- **Logo links:** the server downloads https logos only from public
  addresses (never localhost, private or Railway-internal hosts), with a
  5-second timeout, a 2 MB cap and at most 3 checked redirects
  (`backend/src/utils/remoteImage.js`).
- **Roles:** Admin-only areas (team, settings, suppliers, imports, reports,
  stock counts, activity log, till history) are enforced on the server, not
  only hidden in the UI. Staff discounts are limited server-side. Staff
  count the till blind: the expected total is shown to them only after
  they close it.
- **Receipt and quote links** shared on WhatsApp use 144-bit random tokens,
  are rate-limited and marked noindex; a cancelled quote's link stops working.
  The web app itself is served with `X-Robots-Tag: noindex`.
- **Audit:** sign-ins, lockouts, sales, payments, imports, reminders and
  admin actions are written to the activity log.
- **Headers:** HSTS, nosniff, frame-deny, strict referrer policy and a
  restrictive CSP on API responses; CORS limited to configured origins.
  The web app (`frontend/vercel.json`) sends its own CSP (scripts only from
  the app itself, API calls only to the StockDesk API and the local printer
  bridge), frame-deny, nosniff and a permissions policy. If the API address
  changes, add it to `connect-src` there first.
- **Development safety:** `STOCKDESK_LOCAL_ONLY=1` makes the backend refuse
  any non-local database (used by `scripts/dev-local.ps1`).

Known gaps (see docs/ROADMAP.md): no two-step sign-in yet; tokens are kept
in the browser's localStorage; database backups rely on the host.

## Best Practices for Deployment

- Never commit `.env` files
- Use strong, unique `JWT_SECRET` values
- Keep dependencies updated
- Use HTTPS in production
- Restrict CORS to your actual domains
- Keep regular database backups outside the hosting provider
