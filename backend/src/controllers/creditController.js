const crypto = require('crypto');
const { Op, QueryTypes } = require('sequelize');
const { Customer, Sale, Receipt, CreditPayment, User, sequelize } = require('../models');
const auditController = require('./auditController');

const PAYMENT_METHODS = ['Cash', 'Card', 'Mobile Money'];

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function todayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// GET /api/credit/summary — everyone who owes the shop money.
exports.summary = async (req, res, next) => {
  try {
    const today = todayDateString();
    const debtors = await sequelize.query(
      `SELECT
         c.id AS "customerId",
         c.name,
         c.phone,
         c.whatsapp,
         c."lastReminderAt",
         c."creditLimit",
         SUM(s."balanceDue")::float AS "balance",
         SUM(CASE WHEN s."dueDate" < :today THEN s."balanceDue" ELSE 0 END)::float AS "overdue",
         COUNT(s.id)::int AS "openSales",
         MIN(s."createdAt") AS "oldestSaleAt",
         MIN(s."dueDate") AS "nextDueDate"
       FROM "sales" s
       JOIN "customers" c ON c.id = s."customerId"
       WHERE s."shopId" = :shopId AND s."balanceDue" > 0
       GROUP BY c.id
       ORDER BY "balance" DESC`,
      { replacements: { shopId: req.user.shopId, today }, type: QueryTypes.SELECT }
    );

    const totalOutstanding = roundMoney(debtors.reduce((sum, d) => sum + Number(d.balance || 0), 0));
    const totalOverdue = roundMoney(debtors.reduce((sum, d) => sum + Number(d.overdue || 0), 0));

    res.json({
      totalOutstanding,
      totalOverdue,
      debtorCount: debtors.length,
      debtors,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/customers/:id/credit — statement for one customer.
exports.customerStatement = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({
      where: { id: req.params.id, shopId: req.user.shopId },
      attributes: ['id', 'name', 'phone', 'whatsapp', 'email', 'creditLimit', 'lastReminderAt'],
    });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const [openSales, payments] = await Promise.all([
      Sale.findAll({
        where: { shopId: req.user.shopId, customerId: customer.id, balanceDue: { [Op.gt]: 0 } },
        attributes: ['id', 'total', 'creditAmount', 'balanceDue', 'dueDate', 'currency', 'createdAt'],
        include: [{ model: Receipt, as: 'receipt', attributes: ['receiptNumber'] }],
        order: [['createdAt', 'ASC']],
      }),
      CreditPayment.findAll({
        where: { shopId: req.user.shopId, customerId: customer.id },
        attributes: ['id', 'saleId', 'amount', 'method', 'receiptGroup', 'notes', 'createdAt'],
        include: [{ model: User, as: 'receivedBy', attributes: ['id', 'name'] }],
        order: [['createdAt', 'DESC']],
        limit: 100,
      }),
    ]);

    const balance = roundMoney(openSales.reduce((sum, s) => sum + Number(s.balanceDue || 0), 0));
    const creditLimit = customer.creditLimit == null ? null : Number(customer.creditLimit);

    res.json({
      customer,
      balance,
      creditLimit,
      availableCredit: creditLimit == null ? null : roundMoney(Math.max(0, creditLimit - balance)),
      openSales,
      payments,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/customers/:id/payments — record money received against credit.
// Body: { amount, method, notes?, saleId? }. Without saleId the payment
// settles the customer's oldest debts first.
exports.recordPayment = async (req, res, next) => {
  // Opened inside try: if the pool is exhausted the error must reach next()
  // instead of escaping as an unhandled rejection.
  let transaction;
  const reject = async (status, message) => {
    await transaction.rollback();
    return res.status(status).json({ message });
  };
  try {
    transaction = await sequelize.transaction();
    const amount = roundMoney(Number(req.body.amount));
    const method = req.body.method || 'Cash';
    const notes = req.body.notes ? String(req.body.notes).trim().slice(0, 500) : null;

    if (!Number.isFinite(amount) || amount <= 0) return reject(400, 'Payment amount must be greater than 0');
    if (!PAYMENT_METHODS.includes(method)) return reject(400, 'Payment method must be Cash, Card or Mobile Money');

    const customer = await Customer.findOne({
      where: { id: req.params.id, shopId: req.user.shopId },
      transaction,
    });
    if (!customer) return reject(404, 'Customer not found');

    const where = { shopId: req.user.shopId, customerId: customer.id, balanceDue: { [Op.gt]: 0 } };
    if (req.body.saleId) where.id = Number(req.body.saleId);

    // Lock the open sales so two payments recorded at the same time cannot
    // both settle the same balance.
    const openSales = await Sale.findAll({
      where,
      order: [['createdAt', 'ASC'], ['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (openSales.length === 0) {
      return reject(400, req.body.saleId ? 'That sale has no outstanding balance' : `${customer.name} has no outstanding balance`);
    }

    const outstanding = roundMoney(openSales.reduce((sum, s) => sum + Number(s.balanceDue), 0));
    if (amount > outstanding) {
      return reject(400, `Payment is more than what is owed (${outstanding.toFixed(2)})`);
    }

    const receiptGroup = crypto.randomUUID();
    const allocations = [];
    let remaining = amount;
    for (const sale of openSales) {
      if (remaining <= 0) break;
      const due = Number(sale.balanceDue);
      const applied = roundMoney(Math.min(due, remaining));
      sale.balanceDue = roundMoney(due - applied);
      await sale.save({ transaction });
      await CreditPayment.create(
        {
          saleId: sale.id,
          customerId: customer.id,
          amount: applied,
          method,
          receiptGroup,
          notes,
          receivedByUserId: req.user.id,
          shopId: req.user.shopId,
        },
        { transaction }
      );
      allocations.push({ saleId: sale.id, applied, balanceDue: Number(sale.balanceDue) });
      remaining = roundMoney(remaining - applied);
    }

    await transaction.commit();

    await auditController.logAction(
      req.user.id,
      req.user.shopId,
      'CREATE',
      'CREDIT_PAYMENT',
      customer.id,
      { amount, method, receiptGroup, allocations },
      req
    );

    res.status(201).json({
      receiptGroup,
      amount,
      method,
      allocations,
      balance: roundMoney(outstanding - amount),
    });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
};
