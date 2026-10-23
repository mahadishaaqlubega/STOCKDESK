const { QueryTypes } = require('sequelize');
const { Product, Customer, sequelize } = require('../models');
const auditController = require('./auditController');

// Spreadsheet import. The browser reads the file and posts plain rows; this
// validates every row and either reports what would happen (dryRun) or
// applies all of it in one transaction. Nothing is saved while any row has
// an error, so a half-imported catalogue can't happen.

const MAX_ROWS = 5000;
const PREVIEW_ROWS = 300;

function text(value, max = 255) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
}

// Accepts 12000, "12,000", "UGX 12,000", " 12000.50 ".
function amount(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  if (typeof value === 'number') return value;
  const cleaned = String(value).replace(/[^\d.-]/g, '');
  return cleaned === '' ? NaN : Number(cleaned);
}

function wholeNumber(value) {
  const n = amount(value);
  return n === null ? null : n;
}

function normType(value) {
  const v = text(value).toLowerCase();
  if (!v) return '';
  if (['service', 'services', 'labour', 'labor'].includes(v)) return 'service';
  if (['goods', 'good', 'product', 'item', 'stock'].includes(v)) return 'goods';
  return null;
}

function finish(res, { dryRun, results, created, updated, unchanged }) {
  const errors = results.filter((r) => r.action === 'error');
  res.status(dryRun || errors.length ? 200 : 201).json({
    dryRun,
    saved: !dryRun && errors.length === 0,
    total: results.length,
    created,
    updated,
    unchanged,
    errorCount: errors.length,
    // Errors first so they are visible even in a long file.
    rows: [...errors, ...results.filter((r) => r.action !== 'error')].slice(0, PREVIEW_ROWS),
  });
}

// POST /api/import/products  { rows: [{ name, category, sku, type, buyPrice,
//   sellPrice, quantity, lowStock }], dryRun = true, updateStock = false }
exports.importProducts = async (req, res, next) => {
  let transaction;
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : null;
    if (!rows || rows.length === 0) return res.status(400).json({ message: 'The file has no product rows' });
    if (rows.length > MAX_ROWS) return res.status(400).json({ message: `Import at most ${MAX_ROWS} products at a time` });
    const dryRun = req.body.dryRun !== false;
    const updateStock = req.body.updateStock === true;
    const shopId = req.user.shopId;

    const existing = await Product.findAll({ where: { shopId }, attributes: ['id', 'name', 'sku', 'category', 'buyPrice', 'sellPrice', 'quantity', 'lowStock', 'type', 'isActive'], raw: true });
    const bySku = new Map(existing.filter((p) => p.sku).map((p) => [String(p.sku).trim().toLowerCase(), p]));
    const byName = new Map(existing.map((p) => [String(p.name).trim().toLowerCase(), p]));
    const seen = new Map();

    const results = rows.map((raw, index) => {
      const rowNumber = Number(raw.__row) || index + 2; // spreadsheet row (header is row 1)
      const name = text(raw.name);
      const sku = text(raw.sku, 64);
      const type = normType(raw.type);
      const sellPrice = amount(raw.sellPrice);
      const buyPrice = amount(raw.buyPrice);
      const quantity = wholeNumber(raw.quantity);
      const lowStock = wholeNumber(raw.lowStock);
      const fail = (message) => ({ row: rowNumber, name: name || '(no name)', action: 'error', message });

      if (!name) return fail('Name is missing');
      if (type === null) return fail('Type must be "goods" or "service"');
      const match = (sku && bySku.get(sku.toLowerCase())) || byName.get(name.toLowerCase());
      // A new product needs a price; an existing one keeps its current price
      // when the column is empty (e.g. a stock-only sheet).
      if (sellPrice === null && (type || 'goods') === 'goods' && !match) return fail('Selling price is missing');
      if (sellPrice !== null && (!Number.isFinite(sellPrice) || sellPrice < 0)) return fail('Selling price is not a valid amount');
      if (buyPrice !== null && (!Number.isFinite(buyPrice) || buyPrice < 0)) return fail('Cost price is not a valid amount');
      if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0)) return fail('Quantity must be a whole number, 0 or more');
      if (lowStock !== null && (!Number.isInteger(lowStock) || lowStock < 0)) return fail('Reorder level must be a whole number, 0 or more');

      const key = sku ? `sku:${sku.toLowerCase()}` : `name:${name.toLowerCase()}`;
      if (seen.has(key)) return fail(`Same product as row ${seen.get(key)}`);
      seen.set(key, rowNumber);

      const resolvedType = type || (match ? match.type : 'goods');
      const fields = {
        name,
        category: text(raw.category) || (match ? match.category : 'General'),
        sku: sku || (match ? match.sku : null),
        type: resolvedType,
        sellPrice: sellPrice ?? (match ? Number(match.sellPrice) : 0),
        buyPrice: buyPrice ?? (match ? Number(match.buyPrice) : 0),
        lowStock: resolvedType === 'service' ? 0 : lowStock ?? (match ? match.lowStock : 5),
      };
      if (resolvedType === 'service') fields.quantity = 0;
      else if (!match) fields.quantity = quantity ?? 0;
      else if (updateStock && quantity !== null) fields.quantity = quantity;

      if (!match) return { row: rowNumber, name, action: 'create', fields };
      // Compare as trimmed text so stray spaces in old data aren't "changes".
      const same = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();
      const changes = Object.keys(fields).filter((k) => !same(fields[k], k === 'sellPrice' || k === 'buyPrice' ? Number(match[k]) : match[k]));
      if (!match.isActive) changes.push('isActive');
      return changes.length
        ? { row: rowNumber, name, action: 'update', id: match.id, fields: { ...fields, isActive: true }, changes }
        : { row: rowNumber, name, action: 'unchanged', id: match.id };
    });

    const created = results.filter((r) => r.action === 'create').length;
    const updated = results.filter((r) => r.action === 'update').length;
    const unchanged = results.filter((r) => r.action === 'unchanged').length;
    const hasErrors = results.some((r) => r.action === 'error');
    const report = results.map(({ fields, ...rest }) => rest);

    if (dryRun || hasErrors) {
      return finish(res, { dryRun, results: report, created, updated, unchanged });
    }

    transaction = await sequelize.transaction();
    const toCreate = results.filter((r) => r.action === 'create').map((r) => ({ ...r.fields, shopId, isActive: true }));
    for (let i = 0; i < toCreate.length; i += 500) {
      await Product.bulkCreate(toCreate.slice(i, i + 500), { transaction });
    }
    for (const r of results.filter((x) => x.action === 'update')) {
      await Product.update(r.fields, { where: { id: r.id, shopId }, transaction });
    }
    await transaction.commit();

    await auditController.logAction(req.user.id, shopId, 'IMPORT', 'PRODUCT', null, { created, updated, unchanged, updateStock }, req);
    finish(res, { dryRun: false, results: report, created, updated, unchanged });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
};

// POST /api/import/customers  { rows: [{ name, phone, whatsapp, email, address, notes }], dryRun }
// Matches existing customers by phone, then by name.
exports.importCustomers = async (req, res, next) => {
  let transaction;
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : null;
    if (!rows || rows.length === 0) return res.status(400).json({ message: 'The file has no customer rows' });
    if (rows.length > MAX_ROWS) return res.status(400).json({ message: `Import at most ${MAX_ROWS} customers at a time` });
    const dryRun = req.body.dryRun !== false;
    const shopId = req.user.shopId;
    const digits = (v) => String(v || '').replace(/\D/g, '').slice(-9);

    const existing = await Customer.findAll({ where: { shopId }, attributes: ['id', 'name', 'phone', 'whatsapp', 'email', 'address', 'notes'], raw: true });
    const byPhone = new Map(existing.filter((c) => digits(c.phone).length >= 7).map((c) => [digits(c.phone), c]));
    const byName = new Map(existing.map((c) => [String(c.name).trim().toLowerCase(), c]));
    const seen = new Map();

    const results = rows.map((raw, index) => {
      const rowNumber = Number(raw.__row) || index + 2;
      const name = text(raw.name);
      const phone = text(raw.phone, 32);
      const email = text(raw.email).toLowerCase();
      const fail = (message) => ({ row: rowNumber, name: name || '(no name)', action: 'error', message });
      if (!name) return fail('Name is missing');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Email is not valid');
      const key = digits(phone).length >= 7 ? `p:${digits(phone)}` : `n:${name.toLowerCase()}`;
      if (seen.has(key)) return fail(`Same customer as row ${seen.get(key)}`);
      seen.set(key, rowNumber);

      const match = (digits(phone).length >= 7 && byPhone.get(digits(phone))) || byName.get(name.toLowerCase());
      const fields = {
        name,
        phone: phone || match?.phone || null,
        whatsapp: text(raw.whatsapp, 32) || match?.whatsapp || null,
        email: email || match?.email || null,
        address: text(raw.address) || match?.address || null,
        notes: text(raw.notes, 2000) || match?.notes || null,
      };
      if (!match) return { row: rowNumber, name, action: 'create', fields };
      const changes = Object.keys(fields).filter((k) => String(fields[k] ?? '').trim() !== String(match[k] ?? '').trim());
      return changes.length ? { row: rowNumber, name, action: 'update', id: match.id, fields, changes } : { row: rowNumber, name, action: 'unchanged', id: match.id };
    });

    const created = results.filter((r) => r.action === 'create').length;
    const updated = results.filter((r) => r.action === 'update').length;
    const unchanged = results.filter((r) => r.action === 'unchanged').length;
    const report = results.map(({ fields, ...rest }) => rest);
    if (dryRun || results.some((r) => r.action === 'error')) {
      return finish(res, { dryRun, results: report, created, updated, unchanged });
    }

    transaction = await sequelize.transaction();
    const toCreate = results.filter((r) => r.action === 'create').map((r) => ({ ...r.fields, shopId, isActive: true }));
    for (let i = 0; i < toCreate.length; i += 500) {
      await Customer.bulkCreate(toCreate.slice(i, i + 500), { transaction });
    }
    for (const r of results.filter((x) => x.action === 'update')) {
      await Customer.update(r.fields, { where: { id: r.id, shopId }, transaction });
    }
    await transaction.commit();
    await auditController.logAction(req.user.id, shopId, 'IMPORT', 'CUSTOMER', null, { created, updated, unchanged }, req);
    finish(res, { dryRun: false, results: report, created, updated, unchanged });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
};

// GET /api/exports/sales?start=YYYY-MM-DD&end=YYYY-MM-DD — one row per item
// sold, for the accountant's spreadsheet. Capped at 50,000 lines.
exports.exportSales = async (req, res, next) => {
  try {
    const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
    if (!isDate(req.query.start) || !isDate(req.query.end)) {
      return res.status(400).json({ message: 'start and end dates are required (YYYY-MM-DD)' });
    }
    // Day boundaries in the shop's local time: tz is the browser's
    // getTimezoneOffset() in minutes (Uganda = -180). Without it a sale at
    // 1 a.m. in Kampala would land on the previous day (UTC).
    const tz = Number.isFinite(Number(req.query.tz)) ? Math.max(-840, Math.min(840, Number(req.query.tz))) : 0;
    const toUtc = (day, addDays = 0) => {
      const [y, m, d] = day.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d + addDays) + tz * 60000);
    };
    const rows = await sequelize.query(
      `SELECT s."createdAt" AS "date", r."receiptNumber", u.name AS "cashier", c.name AS "customer",
              s."paymentMethod", p.name AS "product", p.category, si.quantity,
              COALESCE(si."listPrice", si.price) AS "listPrice", si.price,
              (si.price * si.quantity) AS "lineTotal",
              COALESCE(NULLIF(si."costOfGoods", 0), p."buyPrice", 0) * si.quantity AS "lineCost",
              s.total AS "saleTotal", s.discount AS "saleDiscount", s."taxAmount", s."balanceDue"
       FROM sale_items si
       JOIN sales s ON s.id = si."saleId"
       LEFT JOIN receipts r ON r."saleId" = s.id
       LEFT JOIN users u ON u.id = s."cashierId"
       LEFT JOIN customers c ON c.id = s."customerId"
       LEFT JOIN products p ON p.id = si."productId"
       WHERE s."shopId" = :shopId AND s."createdAt" >= :start AND s."createdAt" < :end
       ORDER BY s."createdAt" ASC, s.id ASC, si.id ASC
       LIMIT 50001`,
      { replacements: { shopId: req.user.shopId, start: toUtc(req.query.start), end: toUtc(req.query.end, 1) }, type: QueryTypes.SELECT }
    );
    res.json({ truncated: rows.length > 50000, rows: rows.slice(0, 50000) });
  } catch (error) {
    next(error);
  }
};

