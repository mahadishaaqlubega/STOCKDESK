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
