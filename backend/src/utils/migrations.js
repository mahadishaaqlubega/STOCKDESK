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
    name: 'index: open credit sales',
    sql: `CREATE INDEX IF NOT EXISTS "sales_open_credit_idx" ON "sales" ("shopId", "customerId") WHERE "balanceDue" > 0;`,
  },
  {
    name: 'index: credit payments by customer',
    sql: `CREATE INDEX IF NOT EXISTS "credit_payments_shop_customer_idx" ON "credit_payments" ("shopId", "customerId");`,
  },
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
