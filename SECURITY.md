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
- **Brute force:** per-IP limits on sign-in, sign-up and email endpoints,
  plus a per-account lockout (10 wrong passwords → 15 minutes; an email
  reset lifts it).
- **Input:** exact-match lookups escape LIKE wildcards; request bodies are
  limited to 3 MB; logos must be PNG/JPEG/WebP or https; ids are validated.
- **Roles:** Admin-only areas (team, settings, suppliers, imports, reports,
  stock counts, activity log) are enforced on the server, not only hidden
  in the UI. Staff discounts are limited server-side.
- **Receipt links** shared on WhatsApp use 144-bit random tokens, are
  rate-limited and marked noindex.
- **Audit:** sign-ins, lockouts, sales, payments, imports, reminders and
  admin actions are written to the activity log.
- **Headers:** HSTS, nosniff, frame-deny, strict referrer policy and a
  restrictive CSP on API responses; CORS limited to configured origins.
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
