const crypto = require('crypto');
const { Op, QueryTypes } = require('sequelize');
const { Supplier, Purchase, PurchaseItem, SupplierPayment, Product, StockIn, User, sequelize } = require('../models');
const auditController = require('./auditController');

const PAYMENT_METHODS = ['Cash', 'Mobile Money', 'Bank', 'Card'];

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function parseDate(value, label) {
  if (value == null || value === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw httpError(400, `${label} must be a date in YYYY-MM-DD format`);
  }
  return String(value);
}

function supplierPayload(body) {
  const clean = (value, max = 255) => (value == null || String(value).trim() === '' ? null : String(value).trim().slice(0, max));
  return {
    name: clean(body.name),
    phone: clean(body.phone, 32),
    whatsapp: clean(body.whatsapp, 32),
    email: clean(body.email) && clean(body.email).toLowerCase(),
    address: clean(body.address),
    notes: clean(body.notes, 2000),
    isActive: body.isActive !== false,
  };
}

// ---------------------------------------------------------------- suppliers

// GET /api/suppliers - every supplier with what was bought and what is owed.
exports.listSuppliers = async (req, res, next) => {
  try {
    const rows = await sequelize.query(
      `SELECT s.id, s.name, s.phone, s.whatsapp, s.email, s.address, s.notes, s."isActive", s."createdAt",
              COALESCE(p."purchaseCount", 0)::int AS "purchaseCount",
              COALESCE(p."purchased", 0)::float AS "purchased",
              COALESCE(p."balance", 0)::float AS "balance",
              p."lastPurchaseDate"
       FROM "suppliers" s
       LEFT JOIN (
         SELECT "supplierId", COUNT(*) AS "purchaseCount", SUM("total") AS "purchased",
                SUM("balanceDue") AS "balance", MAX("purchaseDate") AS "lastPurchaseDate"
         FROM "purchases" WHERE "shopId" = :shopId GROUP BY "supplierId"
       ) p ON p."supplierId" = s.id
       WHERE s."shopId" = :shopId
       ORDER BY s.name ASC`,
      { replacements: { shopId: req.user.shopId }, type: QueryTypes.SELECT }
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

exports.createSupplier = async (req, res, next) => {
  try {
    const payload = supplierPayload(req.body);
    if (!payload.name) return res.status(400).json({ message: 'Supplier name is required' });
    const supplier = await Supplier.create({ ...payload, shopId: req.user.shopId });
    res.status(201).json(supplier);
  } catch (error) {
    next(error);
  }
};

exports.updateSupplier = async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    const payload = supplierPayload(req.body);
    if (!payload.name) return res.status(400).json({ message: 'Supplier name is required' });
    await supplier.update(payload);
    res.json(supplier);
  } catch (error) {
    next(error);
  }
};

// Suppliers with purchase history are archived, never deleted, so old
// purchases keep their supplier.
exports.deleteSupplier = async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    const purchases = await Purchase.count({ where: { supplierId: supplier.id, shopId: req.user.shopId } });
    if (purchases > 0) {
      await supplier.update({ isActive: false });
      return res.json({ archived: true, message: `${supplier.name} has purchase history, so it was archived instead of deleted.` });
    }
    await supplier.destroy();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// GET /api/suppliers/:id/statement - unpaid purchases and payments made.
exports.supplierStatement = async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    const [openPurchases, payments, totals] = await Promise.all([
      Purchase.findAll({
        where: { shopId: req.user.shopId, supplierId: supplier.id, balanceDue: { [Op.gt]: 0 } },
        attributes: ['id', 'reference', 'purchaseDate', 'total', 'amountPaid', 'balanceDue', 'dueDate'],
        order: [['purchaseDate', 'ASC'], ['id', 'ASC']],
      }),
      SupplierPayment.findAll({
        where: { shopId: req.user.shopId, supplierId: supplier.id },
        include: [
          { model: User, as: 'paidBy', attributes: ['id', 'name'] },
          { model: Purchase, as: 'purchase', attributes: ['id', 'reference'] },
        ],
        order: [['createdAt', 'DESC']],
        limit: 100,
      }),
      Purchase.findOne({
        where: { shopId: req.user.shopId, supplierId: supplier.id },
        attributes: [
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total')), 0), 'purchased'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'purchaseCount'],
        ],
        raw: true,
      }),
    ]);
    res.json({
      supplier,
      balance: roundMoney(openPurchases.reduce((sum, p) => sum + Number(p.balanceDue), 0)),
      purchased: Number(totals?.purchased || 0),
      purchaseCount: Number(totals?.purchaseCount || 0),
      openPurchases,
      payments,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/suppliers/:id/payments - { amount, method, notes?, purchaseId? }.
// Without purchaseId the oldest unpaid purchases are settled first.
exports.paySupplier = async (req, res, next) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const amount = roundMoney(Number(req.body.amount));
    const method = req.body.method || 'Cash';
    const notes = req.body.notes ? String(req.body.notes).trim().slice(0, 500) : null;
    if (!Number.isFinite(amount) || amount <= 0) throw httpError(400, 'Payment amount must be greater than 0');
    if (!PAYMENT_METHODS.includes(method)) throw httpError(400, `Payment method must be ${PAYMENT_METHODS.join(', ')}`);

    const supplier = await Supplier.findOne({ where: { id: req.params.id, shopId: req.user.shopId }, transaction });
    if (!supplier) throw httpError(404, 'Supplier not found');

    const where = { shopId: req.user.shopId, supplierId: supplier.id, balanceDue: { [Op.gt]: 0 } };
    if (req.body.purchaseId) where.id = Number(req.body.purchaseId);
    const open = await Purchase.findAll({
      where,
      order: [['purchaseDate', 'ASC'], ['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (open.length === 0) throw httpError(400, `Nothing is owed to ${supplier.name}`);
    const owed = roundMoney(open.reduce((sum, p) => sum + Number(p.balanceDue), 0));
    if (amount > owed + 0.005) throw httpError(400, `Payment is more than what is owed (${owed})`);

    const paymentGroup = crypto.randomUUID();
    const allocations = [];
    let remaining = amount;
    for (const purchase of open) {
      if (remaining <= 0) break;
      const applied = roundMoney(Math.min(Number(purchase.balanceDue), remaining));
      purchase.balanceDue = roundMoney(Number(purchase.balanceDue) - applied);
      await purchase.save({ transaction });
      await SupplierPayment.create(
        { supplierId: supplier.id, purchaseId: purchase.id, amount: applied, method, paymentGroup, notes, paidByUserId: req.user.id, shopId: req.user.shopId },
        { transaction }
      );
      allocations.push({ purchaseId: purchase.id, applied, balanceDue: Number(purchase.balanceDue) });
      remaining = roundMoney(remaining - applied);
    }
    await transaction.commit();

    await auditController.logAction(req.user.id, req.user.shopId, 'CREATE', 'SUPPLIER_PAYMENT', supplier.id, { amount, method, allocations }, req);
    res.status(201).json({ amount, method, allocations, balance: roundMoney(owed - amount) });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
};

// ---------------------------------------------------------------- purchases

// GET /api/purchases?supplierId=&limit=&offset=
exports.listPurchases = async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const where = { shopId: req.user.shopId };
    if (req.query.supplierId) where.supplierId = Number(req.query.supplierId);
    if (req.query.unpaid === '1') where.balanceDue = { [Op.gt]: 0 };
    const purchases = await Purchase.findAll({
      where,
      include: [
        { model: Supplier, as: 'supplier', attributes: ['id', 'name'] },
        { model: User, as: 'createdBy', attributes: ['id', 'name'] },
      ],
      attributes: {
        include: [[sequelize.literal('(SELECT COUNT(*) FROM "purchase_items" pi WHERE pi."purchaseId" = "Purchase"."id")::int'), 'itemCount']],
      },
      order: [['purchaseDate', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
    });
    res.json(purchases);
  } catch (error) {
    next(error);
  }
};

exports.getPurchase = async (req, res, next) => {
  try {
    const purchase = await Purchase.findOne({
      where: { id: req.params.id, shopId: req.user.shopId },
      include: [
        { model: Supplier, as: 'supplier', attributes: ['id', 'name', 'phone'] },
        { model: User, as: 'createdBy', attributes: ['id', 'name'] },
        { model: PurchaseItem, as: 'items', include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'category'] }] },
        { model: SupplierPayment, as: 'payments', include: [{ model: User, as: 'paidBy', attributes: ['id', 'name'] }] },
      ],
    });
    if (!purchase) return res.status(404).json({ message: 'Purchase not found' });
    res.json(purchase);
  } catch (error) {
    next(error);
  }
};

// POST /api/purchases - goods received.
// Body: { supplierId, reference?, purchaseDate?, dueDate?, notes?,
//         amountPaid?, paymentMethod?, items: [{ productId, quantity, unitCost, sellPrice? }] }
exports.createPurchase = async (req, res, next) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) throw httpError(400, 'Add at least one product');
    if (items.length > 500) throw httpError(400, 'A purchase can have at most 500 lines');

    const supplier = await Supplier.findOne({ where: { id: req.body.supplierId, shopId: req.user.shopId }, transaction });
    if (!supplier) throw httpError(404, 'Choose a supplier');

    const purchaseDate = parseDate(req.body.purchaseDate, 'Purchase date') || todayString();
    const dueDate = parseDate(req.body.dueDate, 'Due date');
    const paymentMethod = req.body.paymentMethod || 'Cash';
    if (!PAYMENT_METHODS.includes(paymentMethod)) throw httpError(400, `Payment method must be ${PAYMENT_METHODS.join(', ')}`);

    // Merge repeated lines for the same product, validate, then lock rows in
    // id order (same order as checkout, so the two never deadlock).
    const lines = new Map();
    for (const item of items) {
      const productId = Number(item.productId);
      const quantity = Number(item.quantity);
      const unitCost = roundMoney(Number(item.unitCost));
      if (!Number.isInteger(productId)) throw httpError(400, 'Each line needs a product');
      if (!Number.isInteger(quantity) || quantity <= 0) throw httpError(400, 'Quantities must be whole numbers above 0');
      if (!Number.isFinite(unitCost) || unitCost < 0) throw httpError(400, 'Unit cost must be 0 or more');
      const sellPrice = item.sellPrice === undefined || item.sellPrice === null || item.sellPrice === '' ? null : roundMoney(Number(item.sellPrice));
      if (sellPrice !== null && (!Number.isFinite(sellPrice) || sellPrice < 0)) throw httpError(400, 'Selling price must be 0 or more');
      const existing = lines.get(productId);
      if (existing) {
        if (existing.unitCost !== unitCost) throw httpError(400, 'The same product appears twice with different costs; put it on one line');
        existing.quantity += quantity;
        if (sellPrice !== null) existing.sellPrice = sellPrice;
      } else {
        lines.set(productId, { productId, quantity, unitCost, sellPrice });
      }
    }
    const ordered = [...lines.values()].sort((a, b) => a.productId - b.productId);

    let total = 0;
    const products = [];
    for (const line of ordered) {
      const product = await Product.findOne({
        where: { id: line.productId, shopId: req.user.shopId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!product) throw httpError(404, `Product ${line.productId} not found`);
      if (product.type === 'service') throw httpError(400, `${product.name} is a service and holds no stock`);
      total += line.unitCost * line.quantity;
      products.push([product, line]);
    }
    total = roundMoney(total);

    const amountPaid = roundMoney(Number(req.body.amountPaid ?? total));
    if (!Number.isFinite(amountPaid) || amountPaid < 0) throw httpError(400, 'Amount paid must be 0 or more');
    if (amountPaid > total + 0.005) throw httpError(400, 'Amount paid is more than the purchase total');
    const balanceDue = roundMoney(total - amountPaid);

    const purchase = await Purchase.create(
      {
        supplierId: supplier.id,
        reference: req.body.reference ? String(req.body.reference).trim().slice(0, 64) : null,
        purchaseDate,
        total,
        amountPaid,
        balanceDue,
        dueDate: balanceDue > 0 ? dueDate : null,
        paymentMethod: amountPaid > 0 ? paymentMethod : null,
        notes: req.body.notes ? String(req.body.notes).trim().slice(0, 2000) : null,
        createdByUserId: req.user.id,
        shopId: req.user.shopId,
      },
      { transaction }
    );

    for (const [product, line] of products) {
      product.quantity = Number(product.quantity || 0) + line.quantity;
      // Cost price follows what was last paid (as with a manual restock);
      // past sales keep the cost they were sold at.
      product.buyPrice = line.unitCost;
      if (line.sellPrice !== null) product.sellPrice = line.sellPrice;
      await product.save({ transaction });
    }
    await PurchaseItem.bulkCreate(
      ordered.map((line) => ({ purchaseId: purchase.id, productId: line.productId, quantity: line.quantity, unitCost: line.unitCost, shopId: req.user.shopId })),
      { transaction }
    );
    // Stock history on each product shows the delivery.
    await StockIn.bulkCreate(
      ordered.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        costPrice: line.unitCost,
        supplier: supplier.name,
        notes: purchase.reference ? `Purchase ${purchase.reference}` : `Purchase #${purchase.id}`,
        purchaseId: purchase.id,
        addedByUserId: req.user.id,
        shopId: req.user.shopId,
      })),
      { transaction }
    );

    await transaction.commit();

    await auditController.logAction(
      req.user.id,
      req.user.shopId,
      'CREATE',
      'PURCHASE',
      purchase.id,
      { supplier: supplier.name, total, amountPaid, balanceDue, lines: ordered.length },
      req
    );
    res.status(201).json({ ...purchase.toJSON(), itemCount: ordered.length });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
};
