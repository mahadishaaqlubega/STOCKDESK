const { Op } = require('sequelize');
const {
  sequelize,
  TillSession,
  TillMovement,
  Sale,
  CreditPayment,
  SaleReturn,
  Expense,
  SupplierPayment,
  User,
} = require('../models');
const { logAction } = require('./auditController');

const MAX_AMOUNT = 1e11;
// Ugandan notes and coins, for the optional count-by-denomination helper.
const DENOMINATIONS = [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50];

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseAmount(raw, label) {
  const amount = Number(raw);
  if (raw === '' || raw == null || !Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
    throw httpError(400, `${label} must be a number of 0 or more`);
  }
  return roundMoney(amount);
}

function cleanText(raw, max) {
  if (raw == null) return null;
  const text = String(raw).trim();
  return text ? text.slice(0, max) : null;
}

// The cash part of one sale: the whole total for a cash sale, otherwise the
// cash lines of a split or a credit sale's deposit.
function cashFromSale(sale) {
  if (sale.paymentMethod === 'Cash') return Number(sale.total || 0);
  let splits = sale.paymentSplits;
  if (typeof splits === 'string') {
    try {
      splits = JSON.parse(splits);
    } catch {
      splits = null;
    }
  }
  if (!Array.isArray(splits)) return 0;
  return splits
    .filter((split) => split && split.method === 'Cash')
    .reduce((sum, split) => sum + Number(split.amount || 0), 0);
}

// What the drawer should hold now: the float plus every cash movement
// recorded in the shop since the till was opened.
async function cashSummary(session, until, transaction) {
  const shopId = session.shopId;
  const createdAt = { [Op.gte]: session.openedAt, [Op.lte]: until };
  const sumWhere = (model, column, where) =>
    model.sum(column, { where: { shopId, createdAt, ...where }, transaction }).then((v) => Number(v || 0));

  const [sales, creditPayments, returns, expenses, supplierPayments, movements] = await Promise.all([
    Sale.findAll({
      where: { shopId, createdAt },
      attributes: ['paymentMethod', 'total', 'paymentSplits'],
      raw: true,
      transaction,
    }),
    sumWhere(CreditPayment, 'amount', { method: 'Cash' }),
    SaleReturn.findAll({ where: { shopId, createdAt }, attributes: ['totalRefund', 'cashRefund'], raw: true, transaction }),
    sumWhere(Expense, 'amount', { method: 'Cash' }),
    sumWhere(SupplierPayment, 'amount', { method: 'Cash' }),
    TillMovement.findAll({ where: { sessionId: session.id }, attributes: ['type', 'amount'], raw: true, transaction }),
  ]);

  const cashSales = sales.reduce((sum, sale) => sum + cashFromSale(sale), 0);
  const refunds = returns.reduce((sum, r) => sum + Number(r.cashRefund ?? r.totalRefund ?? 0), 0);
  const cashIn = movements.filter((m) => m.type === 'in').reduce((sum, m) => sum + Number(m.amount), 0);
  const cashOut = movements.filter((m) => m.type === 'out').reduce((sum, m) => sum + Number(m.amount), 0);

  const breakdown = {
    openingFloat: roundMoney(session.openingFloat),
    cashSales: roundMoney(cashSales),
    creditPayments: roundMoney(creditPayments),
    cashIn: roundMoney(cashIn),
    refunds: roundMoney(refunds),
    expenses: roundMoney(expenses),
    supplierPayments: roundMoney(supplierPayments),
    cashOut: roundMoney(cashOut),
    salesCount: sales.length,
  };
  const expectedCash = roundMoney(
    breakdown.openingFloat + breakdown.cashSales + breakdown.creditPayments + breakdown.cashIn
      - breakdown.refunds - breakdown.expenses - breakdown.supplierPayments - breakdown.cashOut
  );
  return { expectedCash, breakdown };
}

const sessionIncludes = [
  { model: User, as: 'openedBy', attributes: ['id', 'name'] },
  { model: User, as: 'closedBy', attributes: ['id', 'name'] },
];

const movementIncludes = [{ model: User, as: 'user', attributes: ['id', 'name'] }];

function findOpenSession(shopId, options = {}) {
  return TillSession.findOne({ where: { shopId, closedAt: null }, ...options });
}

// GET /api/till/current - the open till, if any. Only admins see the running
// expected total; staff count blind and see the result once they close.
exports.current = async (req, res, next) => {
  try {
    const session = await findOpenSession(req.user.shopId, { include: sessionIncludes });
    const last = await TillSession.findOne({
      where: { shopId: req.user.shopId, closedAt: { [Op.ne]: null } },
      order: [['closedAt', 'DESC']],
      attributes: ['openingFloat', 'countedCash', 'closedAt'],
    });
    const lastClosed = last
      ? { openingFloat: Number(last.openingFloat), countedCash: Number(last.countedCash), closedAt: last.closedAt }
      : null;
    if (!session) return res.json({ session: null, lastClosed, denominations: DENOMINATIONS });

    const movements = await TillMovement.findAll({
      where: { sessionId: session.id },
      include: movementIncludes,
      order: [['createdAt', 'ASC']],
    });
    const body = { session, movements, lastClosed, denominations: DENOMINATIONS };
    if (req.user.role === 'Admin') {
      Object.assign(body, await cashSummary(session, new Date()));
    }
    res.json(body);
  } catch (error) {
    next(error);
  }
};

// POST /api/till/open { openingFloat, note? }
exports.open = async (req, res, next) => {
  try {
    const openingFloat = parseAmount(req.body.openingFloat, 'Opening float');
    const session = await TillSession.create({
      shopId: req.user.shopId,
      openedByUserId: req.user.id,
      openedAt: new Date(),
      openingFloat,
      openingNote: cleanText(req.body.note, 500),
    });
    await logAction(req.user.id, req.user.shopId, 'TILL_OPENED', 'TillSession', session.id, { openingFloat }, req);
    res.status(201).json({ session });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'The till is already open. Close it before opening a new one.' });
    }
    next(error);
  }
};

// POST /api/till/movements { type: 'in' | 'out', amount, reason }
exports.addMovement = async (req, res, next) => {
  try {
    const type = req.body.type;
    if (type !== 'in' && type !== 'out') throw httpError(400, "Type must be 'in' or 'out'");
    const amount = parseAmount(req.body.amount, 'Amount');
    if (amount <= 0) throw httpError(400, 'Amount must be more than 0');
    const reason = cleanText(req.body.reason, 200);
    if (!reason) throw httpError(400, 'Say what the cash was for');

    const session = await findOpenSession(req.user.shopId);
    if (!session) throw httpError(409, 'Open the till first.');

    const movement = await TillMovement.create({
      shopId: req.user.shopId,
      sessionId: session.id,
      type,
      amount,
      reason,
      userId: req.user.id,
    });
    await logAction(
      req.user.id,
      req.user.shopId,
      type === 'in' ? 'TILL_CASH_IN' : 'TILL_CASH_OUT',
      'TillSession',
      session.id,
      { amount, reason },
      req
    );
    res.status(201).json({ movement });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  }
};

function parseDenominations(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw httpError(400, 'Denominations must be an object');
  const counts = {};
  let total = 0;
  for (const [key, value] of Object.entries(raw)) {
    const note = Number(key);
    const count = Number(value);
    if (!DENOMINATIONS.includes(note)) throw httpError(400, `Unknown note or coin: ${key}`);
    if (!Number.isInteger(count) || count < 0 || count > 1e6) throw httpError(400, `Count for ${key} must be a whole number`);
    if (count > 0) {
      counts[note] = count;
      total += note * count;
    }
  }
  return { counts, total };
}

// POST /api/till/close { countedCash, denominations?, note? }
exports.close = async (req, res, next) => {
  let transaction;
  try {
    const countedCash = parseAmount(req.body.countedCash, 'Cash counted');
    const denominations = parseDenominations(req.body.denominations);
    if (denominations && Math.abs(denominations.total - countedCash) > 0.005) {
      throw httpError(400, 'The notes and coins do not add up to the cash counted');
    }

    transaction = await sequelize.transaction();
    const session = await findOpenSession(req.user.shopId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!session) {
      await transaction.rollback();
      return res.status(409).json({ message: 'The till is not open.' });
    }

    const closedAt = new Date();
    const { expectedCash, breakdown } = await cashSummary(session, closedAt, transaction);
    const difference = roundMoney(countedCash - expectedCash);
    await session.update(
      {
        closedAt,
        closedByUserId: req.user.id,
        countedCash,
        expectedCash,
        difference,
        breakdown,
        denominations: denominations ? denominations.counts : null,
        closingNote: cleanText(req.body.note, 500),
      },
      { transaction }
    );
    await transaction.commit();

    await logAction(
      req.user.id,
      req.user.shopId,
      'TILL_CLOSED',
      'TillSession',
      session.id,
      { countedCash, expectedCash, difference },
      req
    );
    res.json({ session, expectedCash, breakdown, difference });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  }
};

// GET /api/till/sessions?limit= - closed counts, newest first (admins).
exports.listSessions = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 200);
    const sessions = await TillSession.findAll({
      where: { shopId: req.user.shopId, closedAt: { [Op.ne]: null } },
      include: sessionIncludes,
      order: [['closedAt', 'DESC']],
      limit,
    });
    res.json(sessions);
  } catch (error) {
    next(error);
  }
};

// GET /api/till/sessions/:id - one count with its cash in/out lines (admins).
exports.getSession = async (req, res, next) => {
  try {
    const session = await TillSession.findOne({
      where: { id: req.params.id, shopId: req.user.shopId },
      include: sessionIncludes,
    });
    if (!session) return res.status(404).json({ message: 'Till count not found' });
    const movements = await TillMovement.findAll({
      where: { sessionId: session.id },
      include: movementIncludes,
      order: [['createdAt', 'ASC']],
    });
    res.json({ session, movements });
  } catch (error) {
    next(error);
  }
};

exports.cashFromSale = cashFromSale;
exports.DENOMINATIONS = DENOMINATIONS;
