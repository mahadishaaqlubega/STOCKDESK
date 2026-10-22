# QA scripts

Run against a **local copy** of the data, never production.

1. Restore a backup into a scratch database (see `scripts/dev-local.ps1 -NoApps`, then
   `createdb stockdesk_e2e` + `pg_restore --no-owner --no-privileges`).
2. Start a backend on it:
   `STOCKDESK_LOCAL_ONLY=1 DATABASE_URL=postgres://postgres@localhost:55432/stockdesk_e2e DATABASE_SSL=false PORT=4200 JWT_SECRET=e2e-secret node backend/src/server.js`
   Wait for `Database initialization completed successfully` in the log.
3. `node scripts/qa/full-e2e.js` — 160 functional checks across every area: access
   control, team and sign-in security, settings, products and services, customers,
   checkout (discounts, staff limits, VAT, concurrency), offline sync and idempotency,
   receipts and WhatsApp links, credit, returns, expenses, stock counts, suppliers and
   purchases, Excel import/export, reports, activity log, shop isolation, platform
   console, printing.
   It expects the production-shaped data (shop 34 admin id 94, staff id 170, shop 98
   admin id 213, platform owner id 141) and **changes data**, so restore a fresh copy
   before each run; a second run on the same copy reports a few false failures.
4. `node scripts/qa/load.js` — latency/throughput of the main screens and a burst of
   concurrent checkouts. Seed a large shop first for meaningful numbers.

Override the target with `QA_API` and `QA_JWT_SECRET`.
