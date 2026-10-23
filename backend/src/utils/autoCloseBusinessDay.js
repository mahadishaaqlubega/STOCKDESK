const { QueryTypes, Op } = require('sequelize');
const sequelize = require('../config/db');
const { Shop, User, DayClosure } = require('../models');
const { startOfDay, endOfDay, getMetricsForRange } = require('./businessMetrics');

let running = false;

const EMPTY_DAY_WINDOW_DAYS = 30;

function formatDate(raw) {
  if (raw instanceof Date) {
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-${String(raw.getDate()).padStart(2, '0')}`;
  }
  return String(raw).slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

async function closeMissingDaysForShop(shop, existingDates, now) {
  const shopId = shop.id;
  const admin = await User.findOne({
    where: { shopId, role: { [Op.in]: ['SuperAdmin', 'Admin'] } },
    order: [['id', 'ASC']],
    attributes: ['id'],
  });
  if (!admin) return 0;

  // Days that actually have sales (any age) must always be closed.
  const rows = await sequelize.query(
    `SELECT DISTINCT to_char("createdAt", 'YYYY-MM-DD') AS "d"
       FROM "sales"
      WHERE "shopId" = :shopId AND "createdAt" < :today`,
    { replacements: { shopId, today: startOfDay(now) }, type: QueryTypes.SELECT }
  );

  const daysToClose = new Set(rows.map((row) => String(row.d)));

  // Also close recent days with zero sales (e.g. a quiet business day) so the
  // closure history is complete. Backfill is bounded to a recent window to
  // avoid creating a closure for every day since the shop was created.
  const shopStart = startOfDay(new Date(shop.createdAt));
  const windowStart = startOfDay(addDays(now, -EMPTY_DAY_WINDOW_DAYS));
  const startDate = shopStart > windowStart ? shopStart : windowStart;
  const today = startOfDay(now);

  for (let day = new Date(startDate); day < today; day = addDays(day, 1)) {
    const dateStr = formatDate(day);
    if (!existingDates.has(dateStr)) {
      daysToClose.add(dateStr);
    }
  }

  let created = 0;
  for (const dateStr of daysToClose) {
    if (existingDates.has(dateStr)) continue;

    const dayStart = startOfDay(new Date(`${dateStr}T00:00:00`));
    const dayEnd = endOfDay(new Date(`${dateStr}T00:00:00`));
    const metrics = await getMetricsForRange(shopId, dayStart, dayEnd);

    try {
      await DayClosure.create({
        closedForDate: dateStr,
        closedByUserId: admin.id,
        shopId,
        ...metrics,
      });
      created += 1;
    } catch (error) {
      if (error.name !== 'SequelizeUniqueConstraintError') throw error;
    }
  }
  return created;
}

async function autoCloseBusinessDays() {
  if (running) return 0;
  running = true;
  let totalCreated = 0;
  try {
    const now = new Date();
    const shops = await Shop.findAll({ attributes: ['id', 'createdAt'] });
    for (const shop of shops) {
      const closures = await DayClosure.findAll({
        where: { shopId: shop.id },
        attributes: ['closedForDate'],
      });
      const existing = new Set(closures.map((c) => formatDate(c.closedForDate)));
      totalCreated += await closeMissingDaysForShop(shop, existing, now);
    }
    if (totalCreated > 0) {
      console.log(`[auto-close] Created ${totalCreated} automatic business day closure(s)`);
    }
  } catch (error) {
    console.error('[auto-close] Failed:', error.message);
  } finally {
    running = false;
  }
  return totalCreated;
}

function startAutoCloseScheduler({ intervalMs = 5 * 60 * 1000 } = {}) {
  const run = () => {
    autoCloseBusinessDays().catch(() => {});
  };
  setTimeout(run, 10 * 1000);
  const timer = setInterval(run, intervalMs);
  if (timer.unref) timer.unref();
  console.log(`[auto-close] Scheduler started (every ${Math.round(intervalMs / 1000)}s)`);
}

module.exports = { autoCloseBusinessDays, startAutoCloseScheduler };
