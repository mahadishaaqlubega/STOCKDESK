const dotenv = require('dotenv');

dotenv.config();
// Before anything else makes a Date: run the process on shop-local time.
require('./config/timezone');

const PORT = process.env.PORT || 4000;

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is required. Set it in your backend environment before starting StockDesk.');
  process.exit(1);
}
// A short secret can be guessed offline from any one token, which would let
// someone sign their own. Warn rather than refuse, so a deploy never takes
// the shops offline.
if (process.env.JWT_SECRET.length < 32) {
  console.warn('[security] JWT_SECRET is shorter than 32 characters. Replace it with a long random value.');
}

// Last line of defence: a stray async error must never take every shop
// offline. Log it and keep serving (Node's default is to exit).
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

const app = require('./app');
const { sequelize, initAppData } = require('./models');
const { startAutoCloseScheduler } = require('./utils/autoCloseBusinessDay');
const { startBillingReminders } = require('./utils/billingReminders');
const { startCustomerEmailScheduler } = require('./services/customerEmails');
const { runMigrations } = require('./utils/migrations');

async function initializeDatabase() {
  console.log('[db-init] Starting database initialization...');
  // Schema sync: production defaults to create-only (safe) sync. Set
  // DB_SYNC_ALTER=true to allow Sequelize to alter existing tables.
  const allowAlter = String(process.env.DB_SYNC_ALTER || '').toLowerCase() === 'true';
  await sequelize.sync(allowAlter ? { alter: { drop: false } } : {});
  console.log(`[db-init] Sequelize sync completed (${allowAlter ? 'alter' : 'create-only'})`);
  // Additive column/index migrations. Runs after sync so newly created
  // tables exist; a failure here throws so the startup loop retries.
  await runMigrations(sequelize);

  // Schema is ready: start accepting API traffic.
  app.set('dbReady', true);

  try {
    console.log('[db-init] Initializing application data...');
    await initAppData();
    console.log('[db-init] Database initialization completed successfully');
  } catch (error) {
    // Non-schema bootstrap (e.g. SuperAdmin seeding) must not take the API down.
    console.error('[db-init] Application data initialization failed:', error.message);
  }
  startAutoCloseScheduler();
  startBillingReminders();
  startCustomerEmailScheduler();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function start() {
  // Listen immediately, but report not-ready (503) until the schema is
  // migrated. Railway keeps routing to the previous deployment until the
  // /api healthcheck passes, so requests never hit a half-migrated schema.
  app.set('dbReady', false);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[startup] StockDesk backend listening on port ${PORT}`);
  });

  for (let attempt = 1; ; attempt += 1) {
    try {
      await sequelize.authenticate();
      console.log('[startup] Database connection verified');
      await initializeDatabase();
      return;
    } catch (error) {
      console.error(`[startup] Database init attempt ${attempt} failed: ${error.message}`);
      await sleep(5000);
    }
  }
}

start();
