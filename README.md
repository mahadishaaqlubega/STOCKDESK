# StockDesk

Inventory and point-of-sale for small shops: sell at the till (online or
offline), track stock, customers who buy on credit, suppliers, expenses and
profit. Multi-shop: each shop's data is isolated, and a platform owner
console sees all shops.

- **Frontend:** React 18, Vite, Tailwind 3 — deployed on Vercel (`frontend/`)
- **Backend:** Node.js, Express 4, Sequelize 6 — deployed on Railway (`backend/`)
- **Database:** PostgreSQL — Railway

Website: stockdeskinventory.com

## Features

| Area | What it does |
|---|---|
| Point of sale | Product grid with search and categories, held sales, cash / card / Mobile Money / split / credit. Per-item price changes (discounts) and a sale-wide discount. Open-price services. |
| Offline selling | The till opens and sells with no internet (cash, card, Mobile Money, split). Sales queue on the device and sync automatically; never stored twice. See [Offline mode](#offline-mode). |
| Receipts | Printed through the device (any USB / Wi-Fi / Bluetooth printer): 80 mm, 58 mm or A4. PDF receipt with the same layout. "Powered by StockDesk" footer. |
| WhatsApp | Send a receipt (with a secure PDF link) or a debt reminder to a customer's WhatsApp. Uses click-to-chat (`wa.me`): free, the cashier presses Send. |
| Products & services | Goods (stock-tracked) and services (no stock, optional open price). Restock, stock history, stock counts, archive instead of delete. |
| Suppliers & purchases | Record deliveries: stock and cost prices update; unpaid amounts are owed to the supplier; pay in parts (oldest first). |
| Customers & credit | Credit sales with optional limits and due dates, payments (oldest debt first), statements, reminders. |
| Excel | Import products / customers from .xlsx or .csv with a preview; export products, customers and every item sold. |
| Reports | Dashboard, sales/profit by period, best sellers, cashier performance, day closing, refunds, discounts. |
| Team & security | Admin / Staff roles, staff discount limit, activity log, account lockout, session revocation. See [SECURITY.md](SECURITY.md). |

## Repository layout

```
backend/            Express API
  src/config/       db.js (connection, local-only guard), timezone.js
  src/controllers/  request handlers (one per area)
  src/models/       Sequelize models + associations (models/index.js)
  src/routes/       URL -> controller, auth and role guards
  src/utils/        migrations.js, receiptGenerator.js (PDF), businessMetrics.js, ...
  __tests__/        Jest + supertest (models are mocked; no database needed)
frontend/
  src/pages/        one file per screen
  src/components/   shared UI (ui.jsx), receipt, dialogs, offline bar
  src/utils/        api.js, auth.js, offline store/queue, whatsapp, spreadsheet
  sw/sw.template.js service worker template (build fills in the file list)
scripts/
  dev-local.ps1     run everything locally on a copy of the data (Windows)
  qa/               end-to-end checks and load test
docs/               API reference, release notes, roadmap, printing guide
```

## Running locally (safe: never touches production)

Use the helper script. It runs a **separate local PostgreSQL** (port 55432,
data in `D:\STOCKDESK-devdb`), restores the newest backup from
`D:\STOCKDESK-backups\*.dump`, and starts the backend (http://localhost:4000)
and frontend (http://localhost:5173) in two windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev-local.ps1          # start
powershell -ExecutionPolicy Bypass -File scripts\dev-local.ps1 -Fresh   # reload data from the latest backup
powershell -ExecutionPolicy Bypass -File scripts\dev-local.ps1 -Stop    # stop the local database
```

The script sets `STOCKDESK_LOCAL_ONLY=1`; with it, `backend/src/config/db.js`
refuses to connect to any non-local database host. Never run the backend
against production from a development machine. (Note: in PowerShell,
`$env:X=''` *deletes* a variable rather than blanking it, which is why the
script sets an explicit local `DATABASE_URL`.)

Manual setup (any OS): create a database, copy `backend/.env.example` to
`backend/.env`, then `npm run install:all`, `npm run dev:backend` and
`npm run dev:frontend` from the repository root.

> The service worker (offline app shell) only runs in a production build.
> To try offline selling locally, close the backend window: the till shows
> "You're offline", keeps selling, and syncs when you start the backend again.

## Database changes

There is no separate migration step. On boot the backend:

1. runs `sequelize.sync()` in **create-only** mode (creates missing tables,
   never alters existing ones; `DB_SYNC_ALTER=true` exists but don't use it
   in production);
2. runs `backend/src/utils/migrations.js`: additive, idempotent SQL
   (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) safe to run on
   every boot. Add new columns for existing tables here — never DROP or
   change types;
3. only then accepts API traffic (requests get `503 Starting` until ready).

## Testing

```bash
npm run test:backend                 # Jest, 55 tests, no database needed
npm test --prefix frontend           # Vitest, 15 tests
npm run lint:all                     # ESLint, both apps
node scripts/qa/full-e2e.js          # 160 end-to-end checks against a local copy
```

`scripts/qa/README.md` explains how to run the end-to-end and load tests
against a scratch database restored from a backup.

## Configuration

Backend (Railway) environment variables:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` or Railway `PG*` vars | yes | Linked Railway Postgres injects `PG*` automatically |
| `JWT_SECRET` | yes | Long random string |
| `JWT_EXPIRE` | no | Session length, default `8h` |
| `CORS_ORIGINS` | yes | e.g. `https://<your-vercel-domain>` |
| `CORS_ORIGIN_PATTERNS` | no | e.g. `https://*.vercel.app` for preview deploys |
| `FRONTEND_URL` | yes | Used in verification / reset email links |
| `APP_TIMEZONE` | no | Business day time zone, default `Africa/Kampala` |
| `DB_POOL_MAX` | no | Database connections, default 15 |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME` | for email | Or `SMTP_*` |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` (+ optional name/username) | no | Platform owner account, created on boot |

Frontend (Vercel): `VITE_API_URL=https://<your-railway-domain>/api`,
`VITE_ENABLE_SIGNUP` (`false` to hide sign-up).

## Deployment

- **Backend → Railway.** Service root `backend/`, start command `npm start`,
  health check `/api` (`backend/railway.json`). Don't set `DATABASE_HOST` etc.
  on Railway — values like `localhost` override the linked database.
- **Frontend → Vercel.** Root `frontend/`, framework Vite, build `npm run build`,
  output `dist`. `frontend/vercel.json` rewrites routes to `index.html` and sets
  cache headers (`sw.js` must stay `no-cache` so app updates reach devices).
- **Order for a release:** take a database backup → deploy the backend (it
  migrates on boot) → deploy the frontend. Release-specific steps are in
  [docs/RELEASE-NOTES.md](docs/RELEASE-NOTES.md).

## Offline mode

- The build generates `sw.js` with every app file and a version, so after one
  online visit the whole app is stored on the device; each deploy replaces it.
- Products, customers and settings are cached in IndexedDB and used when the
  server is unreachable (`frontend/src/utils/offlineStore.js`).
- A sale made offline is queued on the device with a `clientRef` and an
  `OFFLINE-xxxxxx` receipt. The queue syncs automatically
  (`frontend/src/utils/offlineSales.js`, `components/OfflineBar.jsx`). The
  server stores each `clientRef` once (unique per shop), keeps the real sale
  time and cashier, and allows stock to go below zero for offline sales
  (the goods have already left). Credit sales need a connection.
- Tills are not signed out while offline (idle timer paused; an expired
  session works on the device for up to 24 h; the server still rejects it,
  so syncing resumes after the next sign-in).

## More documentation

- [docs/API.md](docs/API.md) — every endpoint and who may call it
- [docs/RELEASE-NOTES.md](docs/RELEASE-NOTES.md) — what changed and how to go live
- [docs/ROADMAP.md](docs/ROADMAP.md) — where we are and what's next
- [docs/sunmi-pos-local-printing.md](docs/sunmi-pos-local-printing.md) — handheld POS printing
- [SECURITY.md](SECURITY.md) — security model and reporting
