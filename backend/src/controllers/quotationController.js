const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize, Quotation, Product, Customer, Setting, Shop, User } = require('../models');
const { localDateString } = require('../config/timezone');
const { escapeLike } = require('../utils/sql');
const { generateQuotePdf, quoteNumber } = require('../utils/quotePdf');
const { logAction } = require('./auditController');

const DOC_TYPES = ['quotation', 'proforma'];
const MAX_LINES = 200;
const MAX_AMOUNT = 1e11;
const DEFAULT_VALID_DAYS = 14;

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function cleanText(raw, max) {
  if (raw == null) return null;
  const text = String(raw).trim();
  return text ? text.slice(0, max) : null;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDateString(d);
}

// What the list and the app show: 'expired' is an open quote past its date.
function present(quote) {
  const q = typeof quote.toJSON === 'function' ? quote.toJSON() : quote;
  const expired = q.status === 'open' && String(q.validUntil) < localDateString();
  return { ...q, displayNumber: quoteNumber(q), displayStatus: expired ? 'expired' : q.status };
}

// Checks the body and works out every line and total. `existing` is the
// quote being edited (its values fill anything the body leaves out).
async function buildQuote(body, shopId, existing = null) {
  const docType = body.docType ?? existing?.docType ?? 'quotation';
  if (!DOC_TYPES.includes(docType)) throw httpError(400, 'Type must be quotation or proforma');

  const rawItems = body.items ?? existing?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw httpError(400, 'Add at least one item');
  if (rawItems.length > MAX_LINES) throw httpError(400, `A quote can have at most ${MAX_LINES} lines`);

  const productIds = [...new Set(rawItems.map((i) => Number(i?.productId)).filter((id) => Number.isInteger(id) && id > 0))];
  const products = productIds.length
    ? await Product.findAll({ where: { shopId, id: { [Op.in]: productIds } }, attributes: ['id', 'name', 'sellPrice'] })
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));

  const items = rawItems.map((raw, index) => {
    const productId = raw?.productId == null || raw.productId === '' ? null : Number(raw.productId);
    const product = productId ? byId.get(productId) : null;
    if (productId && !product) throw httpError(400, `Line ${index + 1}: product not found`);
    const name = cleanText(raw?.name, 200) || product?.name;
    if (!name) throw httpError(400, `Line ${index + 1}: describe the item`);
    const quantity = Number(raw?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e6) throw httpError(400, `Line ${index + 1}: quantity must be more than 0`);
    const price = raw?.price == null || raw.price === '' ? Number(product?.sellPrice) : Number(raw.price);
    if (!Number.isFinite(price) || price < 0 || price > MAX_AMOUNT) throw httpError(400, `Line ${index + 1}: price must be 0 or more`);
    return { productId: product ? product.id : null, name, quantity, price: roundMoney(price), lineTotal: roundMoney(price * quantity) };
  });

  const subtotal = roundMoney(items.reduce((sum, i) => sum + i.lineTotal, 0));
  const discount = roundMoney(body.discount ?? existing?.discount ?? 0);
  if (!Number.isFinite(discount) || discount < 0 || discount > subtotal) throw httpError(400, 'Discount must be between 0 and the subtotal');

  const settings = await Setting.findOne({ where: { shopId }, attributes: ['vat', 'currency'] });
  const taxRate = existing && body.items === undefined && body.discount === undefined ? Number(existing.taxRate) : Number(settings?.vat || 0);
  const taxAmount = roundMoney(((subtotal - discount) * taxRate) / 100);
  const total = roundMoney(subtotal - discount + taxAmount);

  // Who it is for: a customer on file, or just a name (a school, an office).
  let customer = null;
  const customerIdRaw = body.customerId !== undefined ? body.customerId : existing?.customerId;
  if (customerIdRaw != null && customerIdRaw !== '') {
    customer = await Customer.findOne({ where: { id: Number(customerIdRaw) || 0, shopId }, attributes: ['id', 'name', 'phone', 'email', 'address'] });
    if (!customer) throw httpError(400, 'Customer not found');
  }
  const pick = (field, fallback, max) => cleanText(body[field] !== undefined ? body[field] : existing?.[field] ?? fallback, max);
  const billToName = pick('billToName', customer?.name, 160);
  if (!billToName) throw httpError(400, 'Say who the quote is for');

  const today = localDateString();
  let validUntil = body.validUntil ?? existing?.validUntil ?? addDays(today, DEFAULT_VALID_DAYS);
  validUntil = String(validUntil).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil) || Number.isNaN(new Date(`${validUntil}T12:00:00`).getTime())) throw httpError(400, 'Valid until must be a date');
  if (!existing && validUntil < today) throw httpError(400, 'Valid until cannot be in the past');

  return {
    docType,
    customerId: customer ? customer.id : null,
    billToName,
    billToPhone: pick('billToPhone', customer?.phone, 40),
    billToEmail: pick('billToEmail', customer?.email, 160),
    billToAddress: pick('billToAddress', customer?.address, 255),
    items,
    subtotal,
    discount,
    taxRate,
    taxAmount,
    total,
    currency: settings?.currency || existing?.currency || 'UGX',
    validUntil,
    notes: pick('notes', null, 2000),
  };
}

const listIncludes = [{ model: User, as: 'createdBy', attributes: ['id', 'name'] }];

// GET /api/quotations?q=&status=&limit=&offset=
exports.list = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const where = { shopId: req.user.shopId };
    const today = localDateString();
    const status = String(req.query.status || '');
    if (status === 'open') Object.assign(where, { status: 'open', validUntil: { [Op.gte]: today } });
    else if (status === 'expired') Object.assign(where, { status: 'open', validUntil: { [Op.lt]: today } });
    else if (['converted', 'cancelled'].includes(status)) where.status = status;
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (q) {
      const like = { [Op.iLike]: `%${escapeLike(q)}%` };
      const asNumber = Number(q.replace(/^(QT|PF)-?/i, ''));
      where[Op.or] = [{ billToName: like }, ...(Number.isInteger(asNumber) && asNumber > 0 ? [{ number: asNumber }] : [])];
    }
    const { rows, count } = await Quotation.findAndCountAll({ where, include: listIncludes, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit, offset });
    res.json({ rows: rows.map(present), total: count });
  } catch (error) {
    next(error);
  }
};

async function findQuote(req, options = {}) {
  const quote = await Quotation.findOne({ where: { id: req.params.id, shopId: req.user.shopId }, ...options });
  if (!quote) throw httpError(404, 'Quote not found');
  return quote;
}

// GET /api/quotations/:id
exports.get = async (req, res, next) => {
  try {
    res.json(present(await findQuote(req, { include: listIncludes })));
  } catch (error) {
    next(error);
  }
};

// POST /api/quotations
exports.create = async (req, res, next) => {
  let transaction;
  try {
    const values = await buildQuote(req.body || {}, req.user.shopId);
    transaction = await sequelize.transaction();
    // Lock the shop row so two quotes made at once get different numbers.
    await Shop.findByPk(req.user.shopId, { attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE });
    const last = await Quotation.max('number', { where: { shopId: req.user.shopId }, transaction });
    const quote = await Quotation.create(
      { ...values, shopId: req.user.shopId, number: (Number(last) || 0) + 1, status: 'open', createdByUserId: req.user.id },
      { transaction }
    );
    await transaction.commit();
    await logAction(req.user.id, req.user.shopId, 'QUOTE_CREATED', 'Quotation', quote.id, { number: quoteNumber(quote), total: values.total }, req);
    res.status(201).json(present(quote));
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
};

// PUT /api/quotations/:id - only while the quote is still open.
exports.update = async (req, res, next) => {
  try {
    const quote = await findQuote(req);
    if (quote.status !== 'open') throw httpError(409, `This quote is ${quote.status} and can no longer be changed`);
    const values = await buildQuote(req.body || {}, req.user.shopId, quote.toJSON());
    await quote.update(values);
    res.json(present(quote));
  } catch (error) {
    next(error);
  }
};

// POST /api/quotations/:id/cancel
exports.cancel = async (req, res, next) => {
  try {
    const quote = await findQuote(req);
    if (quote.status !== 'open') throw httpError(409, `This quote is already ${quote.status}`);
    await quote.update({ status: 'cancelled' });
    await logAction(req.user.id, req.user.shopId, 'QUOTE_CANCELLED', 'Quotation', quote.id, { number: quoteNumber(quote) }, req);
    res.json(present(quote));
  } catch (error) {
    next(error);
  }
};

async function sendPdf(res, quote, disposition = 'inline') {
  const settings = await Setting.findOne({ where: { shopId: quote.shopId }, include: [{ model: Shop, as: 'shop', attributes: ['id', 'name'] }] });
  const pdf = await generateQuotePdf(quote.toJSON(), settings ? settings.toJSON() : {});
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename=${quoteNumber(quote)}.pdf`);
  res.send(pdf);
}

// GET /api/quotations/:id/pdf
exports.pdf = async (req, res, next) => {
  try {
    await sendPdf(res, await findQuote(req));
  } catch (error) {
    next(error);
  }
};

// POST /api/quotations/:id/share - a link the customer can open without
// signing in (sent on WhatsApp). 144 random bits, like receipt links.
exports.share = async (req, res, next) => {
  try {
    const quote = await findQuote(req);
    if (!quote.publicToken) await quote.update({ publicToken: crypto.randomBytes(18).toString('base64url') });
    res.json({ token: quote.publicToken });
  } catch (error) {
    next(error);
  }
};

// GET /api/public/quotations/:token - the customer's copy.
exports.publicPdf = async (req, res, next) => {
  try {
    const token = String(req.params.token || '');
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return res.status(404).json({ message: 'Quote not found' });
    const quote = await Quotation.findOne({ where: { publicToken: token } });
    if (!quote || quote.status === 'cancelled') return res.status(404).json({ message: 'Quote not found' });
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    await sendPdf(res, quote);
  } catch (error) {
    next(error);
  }
};

// Called by createSale when a sale came from a quote (same transaction).
exports.markConverted = async (shopId, quotationId, saleId, transaction) => {
  const id = Number(quotationId);
  if (!Number.isInteger(id) || id <= 0) return;
  await Quotation.update({ status: 'converted', saleId }, { where: { id, shopId, status: 'open' }, transaction });
};

exports.buildQuote = buildQuote;
