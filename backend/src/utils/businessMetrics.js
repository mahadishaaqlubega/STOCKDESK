const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function startOfWeek(date) {
  const value = startOfDay(date);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  return value;
}

function endOfWeek(date) {
  const value = startOfWeek(date);
  value.setDate(value.getDate() + 6);
  value.setHours(23, 59, 59, 999);
  return value;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function createEmptyMetrics() {
  return {
    netSales: 0,
    grossSales: 0,
    grossProfit: 0,
    itemsSold: 0,
    orderCount: 0,
    discountTotal: 0,
    refundTotal: 0,
    creditSales: 0,
    creditCollected: 0,
  };
}

// Unit cost of a sold line: the cost recorded at sale time, falling back to
// the product's current buy price for older lines recorded before costs were
// stored (those were saved as 0).
const LINE_UNIT_COST = 'COALESCE(NULLIF(si."costOfGoods", 0), p."buyPrice", 0)';

async function getMetricsForRange(shopId, start, end) {
  try {
    const rows = await sequelize.query(
      `WITH range_sales AS (
         SELECT s.id, s."total", s."taxAmount", s."discount", s."creditAmount"
         FROM "sales" s
         WHERE s."shopId" = :shopId AND s."createdAt" >= :start AND s."createdAt" <= :end
       ),
       sold AS (
         SELECT COALESCE(SUM(${LINE_UNIT_COST} * si."quantity"), 0) AS "cost",
                COALESCE(SUM(si."quantity"), 0) AS "itemsSold",
                COALESCE(SUM(GREATEST(COALESCE(si."listPrice", si."price") - si."price", 0) * si."quantity"), 0) AS "itemDiscounts"
         FROM "sale_items" si
         JOIN range_sales rs ON rs.id = si."saleId"
         LEFT JOIN "products" p ON p.id = si."productId"
       ),
       refunded AS (
         SELECT COALESCE(SUM(r."totalRefund"), 0) AS "refunds"
         FROM "sale_returns" r
         WHERE r."shopId" = :shopId AND r."createdAt" >= :start AND r."createdAt" <= :end
       ),
       returned_cost AS (
         SELECT COALESCE(SUM(ri."quantity" * COALESCE(NULLIF(lc."costOfGoods", 0), p."buyPrice", 0)), 0) AS "cost"
         FROM "sale_return_items" ri
         JOIN "sale_returns" r ON r.id = ri."returnId"
         LEFT JOIN "products" p ON p.id = ri."productId"
         LEFT JOIN LATERAL (
           SELECT si."costOfGoods" FROM "sale_items" si
           WHERE si."saleId" = r."saleId" AND si."productId" = ri."productId"
           LIMIT 1
         ) lc ON true
         WHERE r."shopId" = :shopId AND r."createdAt" >= :start AND r."createdAt" <= :end
       ),
       collected AS (
         SELECT COALESCE(SUM(cp."amount"), 0) AS "amount"
         FROM "credit_payments" cp
         WHERE cp."shopId" = :shopId AND cp."createdAt" >= :start AND cp."createdAt" <= :end
       )
       SELECT
         COALESCE((SELECT SUM("total" - "taxAmount") FROM range_sales), 0) AS "salesExTax",
         COALESCE((SELECT SUM("total" + "discount" - "taxAmount") FROM range_sales), 0)
           + (SELECT "itemDiscounts" FROM sold) AS "grossSales",
         COALESCE((SELECT SUM("discount") FROM range_sales), 0)
           + (SELECT "itemDiscounts" FROM sold) AS "discountTotal",
         COALESCE((SELECT SUM("creditAmount") FROM range_sales), 0) AS "creditSales",
         (SELECT COUNT(*) FROM range_sales)::int AS "orderCount",
         (SELECT "cost" FROM sold) AS "costOfGoods",
         (SELECT "itemsSold" FROM sold) AS "itemsSold",
         (SELECT "refunds" FROM refunded) AS "refundTotal",
         (SELECT "cost" FROM returned_cost) AS "returnedCost",
         (SELECT "amount" FROM collected) AS "creditCollected"`,
      {
        replacements: { shopId, start, end },
        type: QueryTypes.SELECT,
      }
    );

    const row = rows[0] || {};
    const refundTotal = Number(row.refundTotal) || 0;
    // Refunds reduce revenue; returned goods go back on the shelf, so their
    // cost is removed from cost of goods sold as well.
    const netSales = (Number(row.salesExTax) || 0) - refundTotal;
    const costOfGoods = (Number(row.costOfGoods) || 0) - (Number(row.returnedCost) || 0);

    return {
      netSales,
      grossSales: Number(row.grossSales) || 0,
      grossProfit: netSales - costOfGoods,
      itemsSold: Number(row.itemsSold) || 0,
      orderCount: Number(row.orderCount) || 0,
      discountTotal: Number(row.discountTotal) || 0,
      refundTotal,
      creditSales: Number(row.creditSales) || 0,
      creditCollected: Number(row.creditCollected) || 0,
    };
  } catch (error) {
    console.error('getMetricsForRange failed:', error.message);
    return createEmptyMetrics();
  }
}

module.exports = {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  createEmptyMetrics,
  getMetricsForRange,
};
