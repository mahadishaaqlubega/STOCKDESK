const { Sale, SaleItem, Product, User, Expense, Customer } = require('../models');

const RANGE_SALES_LIMIT = 1000;
const { fn, col, Op, literal } = require('sequelize');
const { parseLocalDate } = require('../config/timezone');
const { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, getMetricsForRange } = require('../utils/businessMetrics');
const sequelize = require('../config/db');

function buildComparison(currentValue, previousValue) {
  const delta = currentValue - previousValue;
  const percentChange = previousValue === 0 ? (currentValue === 0 ? 0 : 100) : (delta / previousValue) * 100;

  return {
    current: currentValue,
    previous: previousValue,
    delta,
    percentChange,
  };
}

exports.summary = async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const yesterdayDate = new Date(todayStart);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStart = startOfDay(yesterdayDate);
    const yesterdayEnd = endOfDay(yesterdayDate);

    const thisWeekStart = startOfWeek(now);
    const thisWeekEnd = endOfWeek(now);
    const lastWeekDate = new Date(thisWeekStart);
    lastWeekDate.setDate(lastWeekDate.getDate() - 7);
    const lastWeekStart = startOfWeek(lastWeekDate);
    const lastWeekEnd = endOfWeek(lastWeekDate);

    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStart = startOfMonth(lastMonthDate);
    const lastMonthEnd = endOfMonth(lastMonthDate);

    const empty = { netSales: 0, grossSales: 0, grossProfit: 0, itemsSold: 0, orderCount: 0, discountTotal: 0 };
    const safe = async (fn) => { try { return await fn(); } catch { return empty; } };

    const [today, yesterday, thisWeek, lastWeek, thisMonth, lastMonth] = await Promise.all([
      safe(() => getMetricsForRange(req.user.shopId, todayStart, todayEnd)),
      safe(() => getMetricsForRange(req.user.shopId, yesterdayStart, yesterdayEnd)),
      safe(() => getMetricsForRange(req.user.shopId, thisWeekStart, thisWeekEnd)),
      safe(() => getMetricsForRange(req.user.shopId, lastWeekStart, lastWeekEnd)),
      safe(() => getMetricsForRange(req.user.shopId, thisMonthStart, thisMonthEnd)),
      safe(() => getMetricsForRange(req.user.shopId, lastMonthStart, lastMonthEnd)),
    ]);

    res.json({
      periods: {
        today,
        yesterday,
        thisWeek,
        lastWeek,
        thisMonth,
        lastMonth,
      },
      comparisons: {
        todayVsYesterday: {
          netSales: buildComparison(today.netSales, yesterday.netSales),
          grossProfit: buildComparison(today.grossProfit, yesterday.grossProfit),
          itemsSold: buildComparison(today.itemsSold, yesterday.itemsSold),
        },
        thisWeekVsLastWeek: {
          netSales: buildComparison(thisWeek.netSales, lastWeek.netSales),
          grossProfit: buildComparison(thisWeek.grossProfit, lastWeek.grossProfit),
          itemsSold: buildComparison(thisWeek.itemsSold, lastWeek.itemsSold),
        },
        thisMonthVsLastMonth: {
          netSales: buildComparison(thisMonth.netSales, lastMonth.netSales),
          grossProfit: buildComparison(thisMonth.grossProfit, lastMonth.grossProfit),
          itemsSold: buildComparison(thisMonth.itemsSold, lastMonth.itemsSold),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.dashboardStats = async (req, res, next) => {
  try {
    const shopId = req.user.shopId;
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const emptyProducts = { totalProducts: 0, totalStock: 0, lowStockCount: 0, outOfStockCount: 0 };
    const safe = async (fn) => { try { return await fn(); } catch { return null; } };

    const [productStats, salesTrend] = await Promise.all([
      safe(() => sequelize.query(
        `SELECT
           COUNT(*)::int AS "totalProducts",
           COALESCE(SUM("quantity"), 0)::int AS "totalStock",
           -- Respect each product's own reorder level; out-of-stock is reported separately.
           COUNT(*) FILTER (WHERE "quantity" > 0 AND "quantity" <= COALESCE("lowStock", 5))::int AS "lowStockCount",
           COUNT(*) FILTER (WHERE "quantity" <= 0)::int AS "outOfStockCount"
         FROM "products"
         WHERE "shopId" = :shopId AND COALESCE("type", 'goods') = 'goods' AND "isActive" = true`,
        { replacements: { shopId }, type: sequelize.QueryTypes.SELECT }
      )),
      safe(() => sequelize.query(
        `SELECT
           to_char(s."createdAt", 'YYYY-MM-DD') AS "day",
           COALESCE(SUM(s."total"), 0) AS "sales",
           COUNT(s.id)::int AS "orders"
         FROM "sales" s
         WHERE s."shopId" = :shopId AND s."createdAt" >= :start
         GROUP BY to_char(s."createdAt", 'YYYY-MM-DD')
         ORDER BY day`,
        { replacements: { shopId, start: sevenDaysAgo }, type: sequelize.QueryTypes.SELECT }
      )),
    ]);

    res.json({
      products: (productStats && productStats[0]) || emptyProducts,
      salesTrend: salesTrend || [],
    });
  } catch (error) {
    next(error);
  }
};

exports.dailySales = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sales = await Sale.findAll({
      where: { shopId: req.user.shopId, createdAt: { [Op.gte]: today } },
      order: [['createdAt', 'DESC']],
    });
    res.json(sales);
  } catch (error) {
    next(error);
  }
};

exports.monthlySales = async (req, res, next) => {
  try {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const sales = await Sale.findAll({
      where: { shopId: req.user.shopId, createdAt: { [Op.gte]: start } },
      order: [['createdAt', 'DESC']],
    });
    res.json(sales);
  } catch (error) {
    next(error);
  }
};

exports.bestSelling = async (req, res, next) => {
  try {
    const best = await SaleItem.findAll({
      where: { shopId: req.user.shopId },
      attributes: ['productId', [fn('SUM', col('SaleItem.quantity')), 'unitsold']],
      include: [{ model: Product, attributes: ['id', 'name'], where: { shopId: req.user.shopId } }],
      group: ['SaleItem.productId', 'Product.id'],
      order: [[fn('SUM', col('SaleItem.quantity')), 'DESC']],
      limit: 10,
    });
    res.json(best);
  } catch (error) {
    // Return empty list instead of crashing - dashboard degrades gracefully
    console.error('bestSelling query failed:', error.message);
    res.json([]);
  }
};

exports.salesByCashier = async (req, res, next) => {
  try {
    const report = await Sale.findAll({
      where: { shopId: req.user.shopId },
      attributes: ['cashierId', [fn('SUM', col('Sale.total')), 'revenue'], [fn('COUNT', col('Sale.id')), 'salesCount']],
      include: [{ model: User, as: 'cashier', attributes: ['name'], where: { shopId: req.user.shopId } }],
      group: ['Sale.cashierId', 'cashier.id'],
    });
    res.json(report);
  } catch (error) {
    next(error);
  }
};

exports.rangeReport = async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ message: 'start and end query params required' });

    const rangeStart = startOfDay(parseLocalDate(start));
    const rangeEnd = endOfDay(parseLocalDate(end));

    const [metrics, sales, topProducts, tierRows] = await Promise.all([
      getMetricsForRange(req.user.shopId, rangeStart, rangeEnd),
      // Sale headers only (no line items) and capped: a month of a busy shop
      // was 31 MB and a minute of database time when every item was included.
      // Totals come from `metrics`, which always covers the whole range.
      Sale.findAll({
        where: { shopId: req.user.shopId, createdAt: { [Op.gte]: rangeStart, [Op.lte]: rangeEnd } },
        attributes: ['id', 'createdAt', 'total', 'taxAmount', 'discount', 'paymentMethod', 'balanceDue', 'priceTier'],
        include: [
          { model: User, as: 'cashier', attributes: ['id', 'name'] },
          { model: Customer, as: 'customer', attributes: ['id', 'name'] },
        ],
        order: [['createdAt', 'DESC']],
        limit: RANGE_SALES_LIMIT,
      }),
      SaleItem.findAll({
        where: { shopId: req.user.shopId },
        attributes: ['productId', [fn('SUM', col('SaleItem.quantity')), 'unitsSold'], [fn('SUM', literal('"SaleItem"."price" * "SaleItem"."quantity"')), 'revenue']],
        include: [
          { model: Sale, attributes: [], where: { shopId: req.user.shopId, createdAt: { [Op.gte]: rangeStart, [Op.lte]: rangeEnd } }, required: true },
          { model: Product, attributes: ['id', 'name', 'buyPrice'], required: false },
        ],
        group: ['SaleItem.productId', 'Product.id'],
        order: [[fn('SUM', col('SaleItem.quantity')), 'DESC']],
        limit: 10,
      }),
      // Retail vs wholesale takings for the whole range.
      Sale.findAll({
        where: { shopId: req.user.shopId, createdAt: { [Op.gte]: rangeStart, [Op.lte]: rangeEnd } },
        attributes: ['priceTier', [fn('COUNT', col('id')), 'orders'], [fn('SUM', col('total')), 'total']],
        group: ['priceTier'],
        raw: true,
      }),
    ]);
    const byPriceTier = { retail: { orders: 0, total: 0 }, wholesale: { orders: 0, total: 0 } };
    for (const row of tierRows) {
      const key = row.priceTier === 'wholesale' ? 'wholesale' : 'retail';
      byPriceTier[key] = { orders: Number(row.orders) || 0, total: Number(row.total) || 0 };
    }

    const expensesInRange = await Expense.findAll({
      where: { shopId: req.user.shopId, date: { [Op.gte]: start, [Op.lte]: end } },
    });
    const totalExpenses = expensesInRange.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

    res.json({ metrics, sales, salesTruncated: sales.length === RANGE_SALES_LIMIT, topProducts, totalExpenses, byPriceTier, start, end });
  } catch (error) {
    next(error);
  }
};

exports.customerSales = async (req, res, next) => {
  try {
    const sales = await Sale.findAll({
      where: { shopId: req.user.shopId, customerId: req.params.customerId },
      include: [
        { model: SaleItem, as: 'items', required: false, include: [{ model: Product, attributes: ['id', 'name'] }] },
        { model: User, as: 'cashier', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 50,
    });
    res.json(sales);
  } catch (error) {
    next(error);
  }
};
