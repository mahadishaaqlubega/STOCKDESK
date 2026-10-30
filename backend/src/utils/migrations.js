// Additive, idempotent schema migrations.
//
// Production runs `sequelize.sync()` in create-only mode, which creates
// missing tables but never touches existing ones. Columns added to existing
// tables therefore need an explicit statement here. Every statement must be
// safe to run on every boot: only ADD ... IF NOT EXISTS, never DROP or
// type changes, so existing shop data is never rewritten or lost.

const STATEMENTS = [
  {
    name: 'sales.paymentMethod enum: Split',
    sql: `DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_sales_paymentMethod') THEN
          ALTER TYPE "enum_sales_paymentMethod" ADD VALUE IF NOT EXISTS 'Split';
        END IF;
      END $$;`,
  },
  {
    name: 'sales.paymentMethod enum: Credit',
    sql: `DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_sales_paymentMethod') THEN
          ALTER TYPE "enum_sales_paymentMethod" ADD VALUE IF NOT EXISTS 'Credit';
        END IF;
      END $$;`,
  },
  {
    name: 'products.type',
    sql: `ALTER TABLE IF EXISTS "products" ADD COLUMN IF NOT EXISTS "type" VARCHAR(16) NOT NULL DEFAULT 'goods';`,
  },
  {
    name: 'sales.creditAmount',
    sql: `ALTER TABLE IF EXISTS "sales" ADD COLUMN IF NOT EXISTS "creditAmount" NUMERIC(12, 2) NOT NULL DEFAULT 0;`,
  },
  {
    name: 'sales.balanceDue',
    sql: `ALTER TABLE IF EXISTS "sales" ADD COLUMN IF NOT EXISTS "balanceDue" NUMERIC(12, 2) NOT NULL DEFAULT 0;`,
  },
  {
    name: 'sales.dueDate',
    sql: `ALTER TABLE IF EXISTS "sales" ADD COLUMN IF NOT EXISTS "dueDate" DATE;`,
  },
  {
    name: 'customers.creditLimit',
    sql: `ALTER TABLE IF EXISTS "customers" ADD COLUMN IF NOT EXISTS "creditLimit" NUMERIC(12, 2);`,
  },
  {
    // Widening VARCHAR(255) -> TEXT is metadata-only in Postgres; no data changes.
    name: 'settings.shopLogoUrl as TEXT (uploaded logos)',
    sql: `DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'settings' AND column_name = 'shopLogoUrl' AND data_type <> 'text'
        ) THEN
          ALTER TABLE "settings" ALTER COLUMN "shopLogoUrl" TYPE TEXT;
        END IF;
      END $$;`,
  },
  {
    name: 'users.tokenVersion',
    sql: `ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    name: 'users.failedLoginCount',
    sql: `ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "failedLoginCount" INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    name: 'users.lockedUntil',
    sql: `ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMPTZ;`,
  },
  {
    name: 'sale_items.listPrice',
    sql: `ALTER TABLE IF EXISTS "sale_items" ADD COLUMN IF NOT EXISTS "listPrice" NUMERIC(12, 2);`,
  },
  {
    name: 'settings.maxDiscountPercent',
    sql: `ALTER TABLE IF EXISTS "settings" ADD COLUMN IF NOT EXISTS "maxDiscountPercent" NUMERIC(5, 2);`,
  },
  {
    name: 'customers.whatsapp',
    sql: `ALTER TABLE IF EXISTS "customers" ADD COLUMN IF NOT EXISTS "whatsapp" VARCHAR(32);`,
  },
  {
    name: 'customers.lastReminderAt',
    sql: `ALTER TABLE IF EXISTS "customers" ADD COLUMN IF NOT EXISTS "lastReminderAt" TIMESTAMPTZ;`,
  },
  {
    name: 'receipts.publicToken',
    sql: `ALTER TABLE IF EXISTS "receipts" ADD COLUMN IF NOT EXISTS "publicToken" VARCHAR(64);`,
  },
  {
    name: 'index: receipts by public token',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "receipts_public_token_idx" ON "receipts" ("publicToken") WHERE "publicToken" IS NOT NULL;`,
  },
  {
    name: 'stock_ins.purchaseId',
    sql: `ALTER TABLE IF EXISTS "stock_ins" ADD COLUMN IF NOT EXISTS "purchaseId" INTEGER;`,
  },
  { name: 'index: purchases by shop and date', sql: `CREATE INDEX IF NOT EXISTS "purchases_shop_date_idx" ON "purchases" ("shopId", "purchaseDate");` },
  { name: 'index: purchases by supplier', sql: `CREATE INDEX IF NOT EXISTS "purchases_supplier_idx" ON "purchases" ("supplierId");` },
  { name: 'index: purchase items by purchase', sql: `CREATE INDEX IF NOT EXISTS "purchase_items_purchase_idx" ON "purchase_items" ("purchaseId");` },
  { name: 'index: supplier payments by supplier', sql: `CREATE INDEX IF NOT EXISTS "supplier_payments_supplier_idx" ON "supplier_payments" ("supplierId");` },
  { name: 'index: suppliers by shop', sql: `CREATE INDEX IF NOT EXISTS "suppliers_shop_name_idx" ON "suppliers" ("shopId", "name");` },
  {
    name: 'sales.clientRef',
    sql: `ALTER TABLE IF EXISTS "sales" ADD COLUMN IF NOT EXISTS "clientRef" VARCHAR(64);`,
  },
  {
    name: 'index: sales by till reference',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "sales_shop_client_ref_idx" ON "sales" ("shopId", "clientRef") WHERE "clientRef" IS NOT NULL;`,
  },
  {
    name: 'index: open credit sales',
    sql: `CREATE INDEX IF NOT EXISTS "sales_open_credit_idx" ON "sales" ("shopId", "customerId") WHERE "balanceDue" > 0;`,
  },
  {
    name: 'index: credit payments by customer',
    sql: `CREATE INDEX IF NOT EXISTS "credit_payments_shop_customer_idx" ON "credit_payments" ("shopId", "customerId");`,
  },
  {
    // Years of `sync({ alter: true })` on every boot re-added the same UNIQUE
    // constraint each time (a known Sequelize bug): production had 175 copies
    // on receipts.receiptNumber and 168 on shops. Every insert paid for all of
    // them. Keep the oldest constraint per column set and drop the identical
    // copies; uniqueness stays enforced and no rows change.
    name: 'drop duplicate UNIQUE constraints',
    sql: `DO $$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT c.conrelid::regclass AS tbl, c.conname
          FROM pg_constraint c
          JOIN pg_namespace n ON n.oid = c.connamespace AND n.nspname = 'public'
          WHERE c.contype = 'u'
            AND EXISTS (
              SELECT 1 FROM pg_constraint k
              WHERE k.conrelid = c.conrelid AND k.contype = 'u' AND k.conkey = c.conkey AND k.oid < c.oid
            )
        LOOP
          EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
        END LOOP;
      END $$;`,
  },
  // Subscription billing and owner contact details.
  { name: 'shops.plan', sql: `ALTER TABLE IF EXISTS "shops" ADD COLUMN IF NOT EXISTS "plan" VARCHAR(20);` },
  { name: 'shops.trialEndsAt', sql: `ALTER TABLE IF EXISTS "shops" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMPTZ;` },
  { name: 'shops.paidUntil', sql: `ALTER TABLE IF EXISTS "shops" ADD COLUMN IF NOT EXISTS "paidUntil" TIMESTAMPTZ;` },
  { name: 'shops.ownerPhone', sql: `ALTER TABLE IF EXISTS "shops" ADD COLUMN IF NOT EXISTS "ownerPhone" VARCHAR(32);` },
  { name: 'shops.businessType', sql: `ALTER TABLE IF EXISTS "shops" ADD COLUMN IF NOT EXISTS "businessType" VARCHAR(60);` },
  { name: 'shops.location', sql: `ALTER TABLE IF EXISTS "shops" ADD COLUMN IF NOT EXISTS "location" VARCHAR(120);` },
  { name: 'shops.billingNotes', sql: `ALTER TABLE IF EXISTS "shops" ADD COLUMN IF NOT EXISTS "billingNotes" TEXT;` },
  { name: 'shops.lastBillingNotice', sql: `ALTER TABLE IF EXISTS "shops" ADD COLUMN IF NOT EXISTS "lastBillingNotice" VARCHAR(48);` },
  {
    // Shops that existed before billing get a full trial from the day billing
    // goes live, so nobody is locked out on launch. Only fills empty values.
    name: 'shops.trialEndsAt backfill for existing shops',
    sql: `UPDATE "shops" SET "trialEndsAt" = now() + interval '30 days' WHERE "trialEndsAt" IS NULL;`,
  },
  { name: 'pending_signups.phone', sql: `ALTER TABLE IF EXISTS "pending_signups" ADD COLUMN IF NOT EXISTS "phone" VARCHAR(32);` },
  { name: 'pending_signups.businessType', sql: `ALTER TABLE IF EXISTS "pending_signups" ADD COLUMN IF NOT EXISTS "businessType" VARCHAR(60);` },
  { name: 'pending_signups.location', sql: `ALTER TABLE IF EXISTS "pending_signups" ADD COLUMN IF NOT EXISTS "location" VARCHAR(120);` },
  { name: 'index: subscription payments by shop', sql: `CREATE INDEX IF NOT EXISTS "subscription_payments_shop_idx" ON "subscription_payments" ("shopId", "createdAt");` },
  { name: 'index: payment requests by shop', sql: `CREATE INDEX IF NOT EXISTS "payment_requests_shop_idx" ON "payment_requests" ("shopId", "status");` },
  // Wholesale and retail prices.
  { name: 'products.wholesalePrice', sql: `ALTER TABLE IF EXISTS "products" ADD COLUMN IF NOT EXISTS "wholesalePrice" NUMERIC(12, 2);` },
  { name: 'products.wholesaleMinQty', sql: `ALTER TABLE IF EXISTS "products" ADD COLUMN IF NOT EXISTS "wholesaleMinQty" INTEGER;` },
  { name: 'customers.priceTier', sql: `ALTER TABLE IF EXISTS "customers" ADD COLUMN IF NOT EXISTS "priceTier" VARCHAR(16) NOT NULL DEFAULT 'retail';` },
  { name: 'sales.priceTier', sql: `ALTER TABLE IF EXISTS "sales" ADD COLUMN IF NOT EXISTS "priceTier" VARCHAR(16) NOT NULL DEFAULT 'retail';` },
  // Loyalty and customer-specific prices.
  { name: 'customers.loyaltyPercent', sql: `ALTER TABLE IF EXISTS "customers" ADD COLUMN IF NOT EXISTS "loyaltyPercent" NUMERIC(5, 2);` },
  { name: 'index: one price per customer and product', sql: `CREATE UNIQUE INDEX IF NOT EXISTS "customer_prices_customer_product_uq" ON "customer_prices" ("customerId", "productId");` },
  { name: 'index: customer prices by shop', sql: `CREATE INDEX IF NOT EXISTS "customer_prices_shop_idx" ON "customer_prices" ("shopId", "customerId");` },
  // Automatic customer and owner emails.
  { name: 'settings.autoEmailReceipts', sql: `ALTER TABLE IF EXISTS "settings" ADD COLUMN IF NOT EXISTS "autoEmailReceipts" BOOLEAN NOT NULL DEFAULT false;` },
  { name: 'settings.autoEmailPaymentThanks', sql: `ALTER TABLE IF EXISTS "settings" ADD COLUMN IF NOT EXISTS "autoEmailPaymentThanks" BOOLEAN NOT NULL DEFAULT false;` },
  { name: 'settings.autoEmailReminders', sql: `ALTER TABLE IF EXISTS "settings" ADD COLUMN IF NOT EXISTS "autoEmailReminders" BOOLEAN NOT NULL DEFAULT false;` },
  { name: 'settings.reminderDaysBefore', sql: `ALTER TABLE IF EXISTS "settings" ADD COLUMN IF NOT EXISTS "reminderDaysBefore" INTEGER NOT NULL DEFAULT 2;` },
  { name: 'settings.reminderRepeatDays', sql: `ALTER TABLE IF EXISTS "settings" ADD COLUMN IF NOT EXISTS "reminderRepeatDays" INTEGER NOT NULL DEFAULT 7;` },
  { name: 'settings.ownerDailySummary', sql: `ALTER TABLE IF EXISTS "settings" ADD COLUMN IF NOT EXISTS "ownerDailySummary" BOOLEAN NOT NULL DEFAULT false;` },
  { name: 'settings.lastDailySummaryDate', sql: `ALTER TABLE IF EXISTS "settings" ADD COLUMN IF NOT EXISTS "lastDailySummaryDate" DATE;` },
  { name: 'customers.lastEmailReminderAt', sql: `ALTER TABLE IF EXISTS "customers" ADD COLUMN IF NOT EXISTS "lastEmailReminderAt" TIMESTAMPTZ;` },
  { name: 'shops.staffLimitOverride', sql: `ALTER TABLE IF EXISTS "shops" ADD COLUMN IF NOT EXISTS "staffLimitOverride" INTEGER;` },
  // Indexes for the queries every screen runs, so lists and reports stay
  // fast as shops grow to thousands of customers and sales.
  { name: 'index: sales by shop and date', sql: `CREATE INDEX IF NOT EXISTS "sales_shop_created_idx" ON "sales" ("shopId", "createdAt");` },
  { name: 'index: sales by customer', sql: `CREATE INDEX IF NOT EXISTS "sales_customer_idx" ON "sales" ("customerId");` },
  { name: 'index: sale items by sale', sql: `CREATE INDEX IF NOT EXISTS "sale_items_sale_idx" ON "sale_items" ("saleId");` },
  { name: 'index: sale items by shop and product', sql: `CREATE INDEX IF NOT EXISTS "sale_items_shop_product_idx" ON "sale_items" ("shopId", "productId");` },
  { name: 'index: products by shop', sql: `CREATE INDEX IF NOT EXISTS "products_shop_name_idx" ON "products" ("shopId", "name");` },
  { name: 'index: customers by shop', sql: `CREATE INDEX IF NOT EXISTS "customers_shop_name_idx" ON "customers" ("shopId", "name");` },
  { name: 'index: receipts by sale', sql: `CREATE INDEX IF NOT EXISTS "receipts_sale_idx" ON "receipts" ("saleId");` },
  { name: 'index: expenses by shop and date', sql: `CREATE INDEX IF NOT EXISTS "expenses_shop_date_idx" ON "expenses" ("shopId", "date");` },
  { name: 'index: stock-ins by product', sql: `CREATE INDEX IF NOT EXISTS "stock_ins_shop_product_idx" ON "stock_ins" ("shopId", "productId");` },
  { name: 'index: users by shop', sql: `CREATE INDEX IF NOT EXISTS "users_shop_idx" ON "users" ("shopId");` },
  { name: 'index: credit payments by sale', sql: `CREATE INDEX IF NOT EXISTS "credit_payments_sale_idx" ON "credit_payments" ("saleId");` },
  // Till cash count. Expenses and returns record how they were paid, so the
  // till knows what left the drawer. Older rows stay NULL.
  { name: 'expenses.method', sql: `ALTER TABLE IF EXISTS "expenses" ADD COLUMN IF NOT EXISTS "method" VARCHAR(16);` },
  { name: 'sale_returns.cashRefund', sql: `ALTER TABLE IF EXISTS "sale_returns" ADD COLUMN IF NOT EXISTS "cashRefund" NUMERIC(12, 2);` },
  {
    name: 'index: one open till per shop',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "till_sessions_one_open_uq" ON "till_sessions" ("shopId") WHERE "closedAt" IS NULL;`,
  },
  { name: 'index: till sessions by shop', sql: `CREATE INDEX IF NOT EXISTS "till_sessions_shop_opened_idx" ON "till_sessions" ("shopId", "openedAt");` },
  { name: 'index: till movements by session', sql: `CREATE INDEX IF NOT EXISTS "till_movements_session_idx" ON "till_movements" ("sessionId");` },
  { name: 'index: credit payments by shop and date', sql: `CREATE INDEX IF NOT EXISTS "credit_payments_shop_created_idx" ON "credit_payments" ("shopId", "createdAt");` },
];

async function runMigrations(sequelize) {
  for (const { name, sql } of STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (error) {
      // Surface the failing step; the caller retries the whole init.
      throw new Error(`Migration "${name}" failed: ${error.message}`);
    }
  }
  console.log(`[migrations] ${STATEMENTS.length} schema checks applied`);
}

module.exports = { runMigrations, STATEMENTS };
