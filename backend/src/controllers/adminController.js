const { Op } = require('sequelize');
const {
  Audit,
  Customer,
  DayClosure,
  Expense,
  PendingSignup,
  Product,
  Receipt,
  Sale,
  SaleItem,
  SaleReturn,
  SaleReturnItem,
  CreditPayment,
  Setting,
  Shop,
  StockIn,
  StockReconciliation,
  User,
  sequelize,
} = require('../models');

const ACTIVITY_WINDOW_HOURS = 24;
const TREND_DAYS = 14;

// Map of shopId -> earliest Admin account, fetched in a single query.
async function fetchShopOwners() {
  const admins = await User.findAll({
    where: { role: 'Admin', shopId: { [Op.not]: null } },
    attributes: ['id', 'name', 'username', 'email', 'isVerified', 'createdAt', 'shopId'],
    order: [['createdAt', 'ASC']],
  });
  const owners = new Map();
  for (const admin of admins) {
    if (!owners.has(admin.shopId)) {
      owners.set(admin.shopId, {
        id: admin.id,
        name: admin.name,
        username: admin.username,
        email: admin.email,
        isVerified: admin.isVerified,
        createdAt: admin.createdAt,
      });
    }
  }
  return owners;
}

exports.getAllShops = async (req, res, next) => {
  try {
    const shops = await Shop.findAll({
      attributes: ['id', 'name', 'slug', 'isActive', 'createdAt'],
      include: [{ model: Setting, as: 'settings', attributes: ['currency'], required: false }],
      order: [['createdAt', 'DESC']],
    });

    const [shopMetricsRows, owners] = await Promise.all([
      sequelize.query(
        `SELECT
           s.id AS "shopId",
           COALESCE(u.cnt, 0) AS "userCount",
           COALESCE(p.cnt, 0) AS "productCount",
           COALESCE(sale.cnt, 0) AS "saleCount"
         FROM "shops" s
         LEFT JOIN (SELECT "shopId", COUNT(*) AS cnt FROM "users" GROUP BY "shopId") u ON u."shopId" = s.id
         LEFT JOIN (SELECT "shopId", COUNT(*) AS cnt FROM "products" GROUP BY "shopId") p ON p."shopId" = s.id
         LEFT JOIN (SELECT "shopId", COUNT(*) AS cnt FROM "sales" GROUP BY "shopId") sale ON sale."shopId" = s.id
         ORDER BY s."createdAt" DESC`,
        { type: sequelize.QueryTypes.SELECT }
      ),
      fetchShopOwners(),
    ]);

    const metricsMap = new Map(shopMetricsRows.map((m) => [m.shopId, m]));
    const results = shops.map((shop) => {
      const m = metricsMap.get(shop.id) || {};
      return {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        isActive: shop.isActive,
        createdAt: shop.createdAt,
        currency: shop.settings?.currency || 'USD',
        owner: owners.get(shop.id) || null,
        metrics: { userCount: Number(m.userCount) || 0, productCount: Number(m.productCount) || 0, saleCount: Number(m.saleCount) || 0 },
      };
    });

    res.json({ shops: results, generatedAt: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
};

exports.getOverview = async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const activityCutoff = new Date(now.getTime() - ACTIVITY_WINDOW_HOURS * 60 * 60 * 1000);

    const [shops, shopMetrics, owners] = await Promise.all([
      Shop.findAll({
        attributes: ['id', 'name', 'slug', 'isActive', 'createdAt'],
        include: [{ model: Setting, as: 'settings', attributes: ['currency'], required: false }],
        order: [['createdAt', 'DESC']],
      }),
      sequelize.query(
        `SELECT
           s.id AS "shopId",
           COALESCE(u.user_count, 0) AS "userCount",
           COALESCE(p.product_count, 0) AS "productCount",
           COALESCE(sale.sale_count, 0) AS "saleCount",
           la."lastSaleAt",
           la."lastCashierName",
           la."lastCashierRole"
         FROM "shops" s
         LEFT JOIN (SELECT "shopId", COUNT(*) AS user_count FROM "users" GROUP BY "shopId") u ON u."shopId" = s.id
         LEFT JOIN (SELECT "shopId", COUNT(*) AS product_count FROM "products" GROUP BY "shopId") p ON p."shopId" = s.id
         LEFT JOIN (SELECT "shopId", COUNT(*) AS sale_count FROM "sales" GROUP BY "shopId") sale ON sale."shopId" = s.id
         LEFT JOIN (
           SELECT
             sl."shopId",
             sl."createdAt" AS "lastSaleAt",
             u2."username" AS "lastCashierName",
             u2."role" AS "lastCashierRole"
           FROM "sales" sl
           LEFT JOIN "users" u2 ON u2.id = sl."cashierId"
           WHERE sl.id IN (SELECT MAX(id) FROM "sales" GROUP BY "shopId")
         ) la ON la."shopId" = s.id
         ORDER BY s."createdAt" DESC`,
        { type: sequelize.QueryTypes.SELECT }
      ),
      fetchShopOwners(),
    ]);

    const metricsMap = new Map(shopMetrics.map((m) => [m.shopId, m]));

    const results = shops.map((shop) => {
      const m = metricsMap.get(shop.id) || {};
      return {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        isActive: shop.isActive,
        createdAt: shop.createdAt,
        currency: shop.settings?.currency || 'USD',
        owner: owners.get(shop.id) || null,
        metrics: { userCount: Number(m.userCount) || 0, productCount: Number(m.productCount) || 0, saleCount: Number(m.saleCount) || 0 },
        activity: {
          lastLoginAt: m.lastSaleAt || null,
          lastActiveUser: m.lastCashierName ? { username: m.lastCashierName, role: m.lastCashierRole } : null,
        },
      };
    });

    const totalUsers = await User.count({ where: { shopId: { [Op.not]: null } } });
    const newShopsToday = results.filter((s) => new Date(s.createdAt) >= todayStart).length;
    const recentlyActiveShops = results.filter(
      (s) => s.activity.lastLoginAt && new Date(s.activity.lastLoginAt) >= activityCutoff
    ).length;

    res.json({
      shops: results,
      summary: {
        totalShops: results.length,
        activeShops: results.filter((s) => s.isActive).length,
        recentlyActiveShops,
        newShopsToday,
        totalUsers,
      },
      activityWindowHours: ACTIVITY_WINDOW_HOURS,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

exports.getDashboard = async (req, res, next) => {
  try {
    const trendDays = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || TREND_DAYS));
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const trendStart = new Date(now);
    trendStart.setDate(trendStart.getDate() - (trendDays - 1));
    trendStart.setHours(0, 0, 0, 0);
    const activityCutoff = new Date(now.getTime() - ACTIVITY_WINDOW_HOURS * 60 * 60 * 1000);

    const [
      shops,
      shopMetricsRows,
      salesTrend,
      signupsTrend,
      recentAudits,
      pendingSignups,
      unverifiedUsers,
      totalUsers,
      totalProducts,
      totalSales,
      newShopsToday,
    ] = await Promise.all([
      Shop.findAll({
        attributes: ['id', 'name', 'slug', 'isActive', 'createdAt'],
        include: [{ model: Setting, as: 'settings', attributes: ['currency'], required: false }],
        order: [['createdAt', 'DESC']],
      }),
      sequelize.query(
        `SELECT
           s.id AS "shopId",
           COALESCE(u.cnt, 0) AS "userCount",
           COALESCE(p.cnt, 0) AS "productCount",
           COALESCE(sale.cnt, 0) AS "saleCount"
         FROM "shops" s
         LEFT JOIN (SELECT "shopId", COUNT(*) AS cnt FROM "users" GROUP BY "shopId") u ON u."shopId" = s.id
         LEFT JOIN (SELECT "shopId", COUNT(*) AS cnt FROM "products" GROUP BY "shopId") p ON p."shopId" = s.id
         LEFT JOIN (SELECT "shopId", COUNT(*) AS cnt FROM "sales" GROUP BY "shopId") sale ON sale."shopId" = s.id
         ORDER BY s."createdAt" DESC`,
        { type: sequelize.QueryTypes.SELECT }
      ),
      Sale.findAll({
        attributes: [
          [sequelize.fn('to_char', sequelize.col('Sale.createdAt'), 'YYYY-MM-DD'), 'day'],
          [sequelize.fn('COUNT', sequelize.col('Sale.id')), 'count'],
        ],
        where: { createdAt: { [Op.gte]: trendStart } },
        group: [sequelize.fn('to_char', sequelize.col('Sale.createdAt'), 'YYYY-MM-DD')],
        raw: true,
      }),
      Shop.findAll({
        attributes: [
          [sequelize.fn('to_char', sequelize.col('Shop.createdAt'), 'YYYY-MM-DD'), 'day'],
          [sequelize.fn('COUNT', sequelize.col('Shop.id')), 'count'],
        ],
        where: { createdAt: { [Op.gte]: trendStart } },
        group: [sequelize.fn('to_char', sequelize.col('Shop.createdAt'), 'YYYY-MM-DD')],
        raw: true,
      }),
      Audit.findAll({
        limit: 20,
        order: [['createdAt', 'DESC']],
        attributes: ['id', 'shopId', 'action', 'entityType', 'entityId', 'details', 'ipAddress', 'createdAt'],
        include: [
          { model: User, as: 'user', attributes: ['username', 'role'], required: false },
          { model: Shop, as: 'shop', attributes: ['name'], required: false },
        ],
      }),
      PendingSignup.count(),
      User.count({ where: { isVerified: false, email: { [Op.not]: null } } }),
      User.count({ where: { shopId: { [Op.not]: null } } }),
      Product.count(),
      Sale.count(),
      Shop.count({ where: { createdAt: { [Op.gte]: todayStart } } }),
    ]);

    const metricsMap = new Map(shopMetricsRows.map((m) => [m.shopId, m]));

    const saleByDay = new Map(salesTrend.map((r) => [String(r.day), Number(r.count)]));
    const signupByDay = new Map(signupsTrend.map((r) => [String(r.day), Number(r.count)]));
    const salesSeries = [];
    const signupsSeries = [];
    for (let i = 0; i < trendDays; i += 1) {
      const date = new Date(trendStart);
      date.setDate(date.getDate() + i);
      const key = date.toISOString().slice(0, 10);
      salesSeries.push({ day: key, label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), count: saleByDay.get(key) || 0 });
      signupsSeries.push({ day: key, label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), count: signupByDay.get(key) || 0 });
    }

    const shopsWithMetrics = shops.map((shop) => {
      const m = metricsMap.get(shop.id) || {};
      return {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        isActive: shop.isActive,
        createdAt: shop.createdAt,
        currency: shop.settings?.currency || 'USD',
        metrics: { userCount: Number(m.userCount) || 0, productCount: Number(m.productCount) || 0, saleCount: Number(m.saleCount) || 0 },
      };
    });

    const recentlyActiveShops = shopsWithMetrics.filter((s) => {
      const audits = recentAudits.filter((a) => a.shopId === s.id && new Date(a.createdAt) >= activityCutoff);
      return audits.length > 0;
    }).length;

    res.json({
      summary: {
        totalShops: shops.length,
        activeShops: shops.filter((s) => s.isActive).length,
        recentlyActiveShops,
        newShopsToday,
        totalUsers,
        totalProducts,
        totalSales,
        pendingSignups,
        unverifiedUsers,
      },
      salesTrend: salesSeries,
      signupsTrend: signupsSeries,
      topShops: [...shopsWithMetrics].sort((a, b) => b.metrics.saleCount - a.metrics.saleCount).slice(0, 5),
      liveActivity: recentAudits.map((a) => ({
        id: a.id,
        shopId: a.shopId,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        details: a.details,
        ipAddress: a.ipAddress,
        createdAt: a.createdAt,
        user: a.user ? { username: a.user.username, role: a.user.role } : null,
        shopName: a.shop?.name || null,
      })),
      activityWindowHours: ACTIVITY_WINDOW_HOURS,
      trendDays,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

exports.getShopDetail = async (req, res, next) => {
  try {
    const shop = await Shop.findByPk(req.params.id, {
      include: [{ model: Setting, as: 'settings', required: false }],
    });
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    const shopId = shop.id;
    const [owner, userCount, productCount, saleCount, customerCount, expenseCount, returnCount, users, recentAudits, lastLoginAudit] =
      await Promise.all([
        User.findOne({ where: { shopId, role: 'Admin' }, attributes: ['id', 'name', 'username', 'email', 'isVerified', 'createdAt'], order: [['createdAt', 'ASC']] }),
        User.count({ where: { shopId } }),
        Product.count({ where: { shopId } }),
        Sale.count({ where: { shopId } }),
        Customer.count({ where: { shopId } }),
        Expense.count({ where: { shopId } }),
        SaleReturn.count({ where: { shopId } }),
        User.findAll({
          where: { shopId },
          attributes: ['id', 'name', 'username', 'email', 'role', 'isVerified', 'createdAt'],
          order: [['createdAt', 'ASC']],
        }),
        Audit.findAll({
          where: { shopId },
          limit: 50,
          order: [['createdAt', 'DESC']],
          attributes: ['id', 'userId', 'action', 'entityType', 'entityId', 'details', 'ipAddress', 'createdAt'],
          include: [{ model: User, as: 'user', attributes: ['username', 'role'], required: false }],
        }),
        Audit.findOne({
          where: { shopId, action: 'LOGIN' },
          order: [['createdAt', 'DESC']],
          attributes: ['createdAt'],
        }),
      ]);

    res.json({
      id: shop.id,
      name: shop.name,
      slug: shop.slug,
      isActive: shop.isActive,
      createdAt: shop.createdAt,
      currency: shop.settings?.currency || 'USD',
      shopName: shop.settings?.shopName || shop.name,
      address: shop.settings?.address || '',
      phone: shop.settings?.phone || '',
      vat: shop.settings?.vat || 0,
      owner: owner
        ? { id: owner.id, name: owner.name, username: owner.username, email: owner.email, isVerified: owner.isVerified, createdAt: owner.createdAt }
        : null,
      lastLoginAt: lastLoginAudit?.createdAt || null,
      metrics: { users: userCount, products: productCount, sales: saleCount, customers: customerCount, expenses: expenseCount, returns: returnCount },
      team: users,
      audits: recentAudits.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        details: a.details,
        ipAddress: a.ipAddress,
        createdAt: a.createdAt,
        user: a.user ? { username: a.user.username, role: a.user.role } : null,
      })),
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteShop = async (req, res, next) => {
  try {
    const shop = await Shop.findByPk(req.params.id);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    const shopId = shop.id;

    await sequelize.transaction(async (t) => {
      // Delete leaf records that reference SaleReturn and Sale
      await SaleReturnItem.destroy({ where: { shopId }, transaction: t });
      await SaleReturn.destroy({ where: { shopId }, transaction: t });
      await Receipt.destroy({ where: { shopId }, transaction: t });
      await CreditPayment.destroy({ where: { shopId }, transaction: t });
      await SaleItem.destroy({ where: { shopId }, transaction: t });
      await Sale.destroy({ where: { shopId }, transaction: t });
      // Delete records that reference Products and Users before them
      await DayClosure.destroy({ where: { shopId }, transaction: t });
      await StockReconciliation.destroy({ where: { shopId }, transaction: t });
      await StockIn.destroy({ where: { shopId }, transaction: t });
      await Audit.destroy({ where: { shopId }, transaction: t });
      await Expense.destroy({ where: { shopId }, transaction: t });
      await Product.destroy({ where: { shopId }, transaction: t });
      await Customer.destroy({ where: { shopId }, transaction: t });
      await Setting.destroy({ where: { shopId }, transaction: t });
      // Null out emails before deleting users so the addresses are immediately
      // freed from any unique constraint and can be reused for a new shop.
      await User.update({ email: null, verificationToken: null, resetPasswordToken: null }, { where: { shopId }, transaction: t });
      await User.destroy({ where: { shopId }, transaction: t });
      await shop.destroy({ transaction: t });
    });

    res.json({ message: 'Shop and all associated data deleted successfully.' });
  } catch (error) {
    next(error);
  }
};