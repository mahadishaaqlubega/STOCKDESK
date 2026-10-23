# Release notes — branch `consolidate-backend`

Status (23 Oct 2026): complete, tested, **not yet pushed or deployed**.
22 commits on top of `main`. Production data is untouched.

Verification at the last commit: backend unit tests 55/55, frontend unit
tests 15/15, lint clean, production build OK, end-to-end 160/160 checks on a
fresh restore of the production backup, browser tests of every new screen,
load test (1,500 customers / 3,300 products / 30,000 sales).

## What's in this release

**Platform**
- The separate `STOCKDESK-BACKEND` repository is merged into `backend/` of
  this repository; Railway should deploy from here (see go-live).
- Business day on shop-local time (`APP_TIMEZONE`, default
  `Africa/Kampala`). Before, "today" started at 3 a.m. in Uganda.
- Scale fixes: paged sales list (19.6 MB → 3 KB), range report 64 s → 1 s,
  checkout lock ordering (50/50 concurrent checkouts succeed), gzip,
  missing indexes, 175 duplicate unique constraints removed.
- Crash-proofing: an unexpected async error is logged instead of taking
  every shop offline; the API answers 503 until migrations finish.

**Selling**
- Credit sales with limits, due dates, part payments, statements.
- Services (no stock) and open-price services.
- Per-item discounts (type the price charged) and a staff discount limit;
  staff can't sell below cost.
- Offline selling with automatic sync (see README → Offline mode).
- Receipts: device printing on any printer, 80 mm / 58 mm / A4, redesigned
  A4/PDF, shop logo upload, "Powered by StockDesk · stockdeskinventory.com".
- WhatsApp: send receipts with a PDF link; debt reminders.

**Stock & money**
- Suppliers and purchases (goods received, supplier debts, payments).
- Excel import/export (products, customers, items sold).
- Correct profit (cost at time of sale), refunds and discounts in reports.

**Security**
- Server-side password rule; password change/reset ends other sessions;
  "Sign out on all devices"; per-account lockout; LIKE wildcard escaping;
  3 MB request limit; JWT pinned to HS256.

**Design**
- All pages redesigned; dashboard keeps the original tile and
  Operations Snapshot layout; coloured edges on summary tiles.

## Database changes (applied automatically on boot)

New tables (created by `sync`, create-only): `credit_payments`, `suppliers`,
`purchases`, `purchase_items`, `supplier_payments`.

New columns (all nullable or with defaults; existing rows unaffected):

| Table | Columns |
|---|---|
| `sales` | `creditAmount`, `balanceDue`, `dueDate`, `clientRef`; payment methods `Split`, `Credit` |
| `sale_items` | `listPrice` |
| `products` | `type` (default `goods`) |
| `customers` | `creditLimit`, `whatsapp`, `lastReminderAt` |
| `receipts` | `publicToken` |
| `users` | `tokenVersion`, `failedLoginCount`, `lockedUntil` |
| `settings` | `maxDiscountPercent`; `shopLogoUrl` widened to TEXT |
| `stock_ins` | `purchaseId` |

Plus indexes, and one cleanup: identical copies of the same UNIQUE
constraint (left by years of `sync({ alter: true })`) are dropped, keeping
the original — uniqueness is still enforced and no rows change.

Existing sessions stay valid through the upgrade (tokens without a version
count as version 0).

## Go-live checklist

1. **Backup.** Take a fresh `pg_dump` of the Railway database and keep it
   off Railway.
2. **Push** the branch and open a pull request into `main`.
3. **Railway** (backend service):
   - Point the service at this repository (`STOCKDESK`), root directory
     `backend`, start command `npm start` (as in `backend/railway.json`).
   - Variables: keep the existing ones; add `APP_TIMEZONE=Africa/Kampala`
     (optional, it is the default). Make sure `JWT_SECRET`, `CORS_ORIGINS`
     and `FRONTEND_URL` are set; do **not** set `DATABASE_HOST` etc.
4. **Merge** at a quiet hour (evening). Railway deploys; watch the log for
   `[migrations] 39 schema checks applied` and
   `Database initialization completed successfully`.
5. **Vercel** deploys the frontend from `main` (root `frontend`). After it
   is live, open the site once on each till so the new app version is saved
   for offline use.
6. **Smoke test** on the live site: sign in, make a cash sale, print/PDF a
   receipt, open Suppliers, open Reports.
7. **Tell the shops:** cashiers whose password is weak are not affected
   until they next change it; the new rule applies to new passwords.

Rollback: redeploy the previous Railway/Vercel deployment. All schema
changes are additive, so the old code keeps working with the new columns.

## Known items / decisions left

- Shop 98 ("Sparkle Super market") exists in the backup but not in
  production. Restore only on the owner's instruction.
- Data check: product "SAM 7N960" has cost 70,001 and price 10,000
  (likely meant 7,000).
- Day closures recorded before this release used UTC days; new ones use
  local days.
