const dotenv = require('dotenv');

dotenv.config();

const PORT = process.env.PORT || 4000;

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is required. Set it in your backend environment before starting StockDesk.');
  process.exit(1);
}

const app = require('./app');
const { sequelize, initAppData } = require('./models');
const { startAutoCloseScheduler } = require('./utils/autoCloseBusinessDay');

async function runMigrations() {
  // Add 'Split' to paymentMethod enum if it doesn't exist yet
  // Sequelize alter:true cannot add values to existing PostgreSQL ENUMs
  try {
    await sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'enum_sales_paymentMethod'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'Split'
            AND enumtypid = (
              SELECT oid
              FROM pg_type
              WHERE typname = 'enum_sales_paymentMethod'
            )
        ) THEN
          ALTER TYPE "enum_sales_paymentMethod" ADD VALUE 'Split';
        END IF;
      END $$;
    `);
    console.log('[migrations] Enum migration completed successfully');
  } catch (error) {
    console.error('[migrations] Enum migration failed:', error.message);
    // Do not silently ignore; log and allow app to continue
    // Enum migration failures may be non-fatal (e.g., already exists on retry)
  }
}

async function initializeDatabase() {
  try {
    console.log('[db-init] Starting background database initialization...');
    await runMigrations();
    // Schema sync: production defaults to create-only (safe) sync. Set
    // DB_SYNC_ALTER=true to allow Sequelize to alter existing tables.
    const allowAlter = String(process.env.DB_SYNC_ALTER || '').toLowerCase() === 'true';
    await sequelize.sync(allowAlter ? { alter: { drop: false } } : {});
    console.log(`[db-init] Sequelize sync completed (${allowAlter ? 'alter' : 'create-only'})`);
    console.log('[db-init] Initializing application data...');
    await initAppData();
    console.log('[db-init] Database initialization completed successfully');
    startAutoCloseScheduler();
  } catch (error) {
    console.error('[db-init] Background database initialization failed:', error.message);
    // Log the failure but do not exit; the app is already listening and may recover
    // Operators should monitor logs for this condition
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function start() {
  // Start listening BEFORE any DB work so the /api healthcheck passes quickly.
  // A slow or briefly unavailable database must not prevent the process from
  // becoming healthy; DB initialization runs in the background and retries.
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[startup] StockDesk backend listening on port ${PORT}`);
  });

  let attempt = 0;
  while (true) {
    attempt += 1;
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
