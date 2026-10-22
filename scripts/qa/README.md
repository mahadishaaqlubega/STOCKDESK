# QA scripts

Run against a **local copy** of the data, never production.

1. Restore a backup into a scratch database (see `scripts/dev-local.ps1 -NoApps`, then
   `createdb stockdesk_e2e` + `pg_restore`).
2. Start a backend on it:
   `STOCKDESK_LOCAL_ONLY=1 DATABASE_URL=postgres://postgres@localhost:55432/stockdesk_e2e DATABASE_SSL=false PORT=4200 JWT_SECRET=e2e-secret node backend/src/server.js`
3. `node scripts/qa/full-e2e.js` — functional checks of every feature (expects the
   production-shaped data: shop 34 admin id 94, staff id 170, shop 98 admin id 213,
   platform owner id 141).
4. `node scripts/qa/load.js` — latency/throughput of the main screens and a burst of
   concurrent checkouts. Seed a large shop first for meaningful numbers.

Override the target with `QA_API` and `QA_JWT_SECRET`.
