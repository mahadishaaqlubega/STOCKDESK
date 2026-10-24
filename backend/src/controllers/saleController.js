const crypto = require('crypto');
const { Sale, SaleItem, Product, Receipt, User, Setting, Shop, Customer, DayClosure, SaleReturn, SaleReturnItem } = require('../models');
const { generateReceiptPdf } = require('../utils/receiptGenerator');
const { startOfDay, endOfDay, getMetricsForRange } = require('../utils/businessMetrics');
const { localDateString } = require('../config/timezone');
const { Op } = require('sequelize');
const auditController = require('./auditController');

function newReceiptToken() {
  return crypto.randomBytes(18).toString('base64url');
}

function buildReceiptNumber(id) {
  return `SD-${String(id).padStart(6, '0')}`;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

const TENDER_METHODS = ['Cash', 'Card', 'Mobile Money'];

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function parseDueDate(value) {
  if (value == null || value === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw httpError(400, 'dueDate must be a date in YYYY-MM-DD format');
  }
  return String(value);
}

// The response for a sale that was already stored (same clientRef).
async function existingSaleResponse(shopId, clientRef, transaction) {
  const sale = await Sale.findOne({
    where: { shopId, clientRef },
    include: [{ model: Receipt, as: 'receipt', attributes: ['receiptNumber'] }],
    transaction,
  });
  if (!sale) return null;
  return {
    saleId: sale.id,
    receipt: sale.receipt?.receiptNumber || buildReceiptNumber(sale.id),
    total: Number(sale.total),
    discount: Number(sale.discount),
    taxAmount: Number(sale.taxAmount),
    currency: sale.currency,
    creditAmount: Number(sale.creditAmount),
    balanceDue: Number(sale.balanceDue),
    dueDate: sale.dueDate,
    duplicate: true,
  };
}

// Offline sales carry the time they happened at the till. Accept up to 14
// days back (a long outage) and a few minutes ahead (clock drift).
function parseSoldAt(value) {
  const soldAt = new Date(value);
  const now = Date.now();
  if (Number.isNaN(soldAt.getTime()) || soldAt.getTime() > now + 10 * 60000 || soldAt.getTime() < now - 14 * 86400000) {
    throw httpError(400, 'The offline sale time is not valid. Check the date and time on this device.');
  }
  return soldAt;
}

exports.createSale = async (req, res, next) => {
  // Opened inside try: if the pool is exhausted the error must reach
  // next() instead of escaping as an unhandled rejection.
  let transaction;
  const clientRef = req.body.clientRef == null || req.body.clientRef === '' ? null : String(req.body.clientRef);
  try {
    if (clientRef !== null && !/^[A-Za-z0-9_-]{8,64}$/.test(clientRef)) {
      throw httpError(400, 'Invalid sale reference');
    }
    transaction = await Sale.sequelize.transaction();
    const { items, paymentMethod, paymentSplits, currency, discount = 0, discountType = 'fixed', customerId = null } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      throw httpError(400, 'Sale must include at least one item');
    }

    // Already stored (a retry from the offline queue, or a response that got
    // lost on a bad connection): answer with the existing sale.
    if (clientRef) {
      const existing = await existingSaleResponse(req.user.shopId, clientRef, transaction);
      if (existing) {
        await transaction.commit();
        return res.status(200).json(existing);
      }
    }
    // A sale made while the till was offline: the goods have already left
    // the shop, so it is recorded even if stock now looks too low (stock
    // may go negative until the next count), at the time it happened.
    const isOffline = req.body.offline === true && Boolean(clientRef);
    const soldAt = isOffline ? parseSoldAt(req.body.soldAt) : null;
    // Synced later, possibly from someone else's session: keep the cashier
    // who actually made the sale, if they belong to this shop.
    let saleCashierId = req.user.id;
    if (isOffline && req.body.cashierId && Number(req.body.cashierId) !== req.user.id) {
      const cashier = await User.findOne({ where: { id: Number(req.body.cashierId), shopId: req.user.shopId }, attributes: ['id'], transaction });
      if (cashier) saleCashierId = cashier.id;
    }

    // Validate payment method, discount and split payments before any writes.
    const allowedPaymentMethods = [...TENDER_METHODS, 'Split', 'Credit'];
    if (!allowedPaymentMethods.includes(paymentMethod)) {
      throw httpError(400, 'Invalid payment method');
    }
    const isCredit = paymentMethod === 'Credit';
    if (isCredit && isOffline) {
      throw httpError(400, 'Credit sales need an internet connection so the customer\'s balance can be checked.');
    }

    const discountValue = Number(discount);
    if (!Number.isFinite(discountValue) || discountValue < 0) {
      throw httpError(400, 'Discount must be a non-negative number');
    }
    if (!['fixed', 'percentage'].includes(discountType)) {
      throw httpError(400, 'discountType must be "fixed" or "percentage"');
    }
    const discountMode = discountType === 'percentage' ? 'percentage' : 'fixed';
    if (discountMode === 'percentage' && discountValue > 100) {
      throw httpError(400, 'Percentage discount cannot exceed 100');
    }

    if (!isCredit && paymentSplits != null) {
      if (!Array.isArray(paymentSplits) || paymentSplits.length === 0) {
        throw httpError(400, 'paymentSplits must be a non-empty array');
      }
      for (const split of paymentSplits) {
        const splitMethod = split && split.method;
        const splitAmount = Number(split && split.amount);
        if (!TENDER_METHODS.includes(splitMethod) || !Number.isFinite(splitAmount) || splitAmount <= 0) {
          throw httpError(400, 'Each payment split must have a valid method and a positive amount');
        }
      }
    }

    const dueDate = isCredit ? parseDueDate(req.body.dueDate) : null;
    const depositMethod = req.body.depositMethod || 'Cash';
    if (isCredit && !TENDER_METHODS.includes(depositMethod)) {
      throw httpError(400, 'depositMethod must be Cash, Card or Mobile Money');
    }

    // Every query in this handler runs on the transaction's connection. A
    // query outside it needs a second pooled connection while the first is
    // held, which starves the pool when many tills check out at once.
    const settings = await Setting.findOne({
      where: { shopId: req.user.shopId },
      include: [{ model: Shop, as: 'shop', attributes: ['id', 'name', 'slug'] }],
      transaction,
    });
    const saleCurrency = currency || (settings && settings.currency) || 'USD';

    let customer = null;
    if (customerId) {
      customer = await Customer.findOne({
        where: { id: customerId, shopId: req.user.shopId },
        transaction,
        // Credit sales lock the customer so concurrent sales cannot both
        // slip under the credit limit.
        ...(isCredit ? { lock: transaction.LOCK.UPDATE } : {}),
      });
      if (!customer) {
        throw httpError(404, 'Selected customer not found');
      }
    }
    if (isCredit && !customer) {
      throw httpError(400, 'Select a customer to sell on credit');
    }

    let subtotal = 0;
    let listSubtotal = 0;
    const itemRecords = [];
    const isAdmin = req.user.role === 'Admin' || req.user.role === 'SuperAdmin';

    // Wholesale prices apply to customers marked wholesale. Admins can also
    // switch a walk-in sale to wholesale; staff cannot, so it can't be used to
    // get round their discount limit.
    if (req.body.priceTier === 'wholesale' && !isAdmin && customer?.priceTier !== 'wholesale') {
      throw httpError(403, 'Only an admin can use wholesale prices for this customer.');
    }
    const wholesaleSale = customer?.priceTier === 'wholesale' || (isAdmin && req.body.priceTier === 'wholesale');
    let usedWholesale = false;

    // Lock rows in ascending product id so two sales touching the same
    // products always queue instead of deadlocking each other.
    const orderedItems = [...items].sort((x, y) => Number(x.productId) - Number(y.productId));

    for (const item of orderedItems) {
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw httpError(400, 'Item quantity must be a positive whole number');
      }
      // Row lock serialises concurrent sales of the same product so two
      // cashiers cannot both sell the last unit.
      const product = await Product.findOne({
        where: { id: item.productId, shopId: req.user.shopId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!product) {
        throw httpError(404, `Product ${item.productId} not found`);
      }
      // Services (repairs, labour, fees) are not stock-tracked.
      const isService = product.type === 'service';
      if (!isService && !isOffline && Number(product.quantity || 0) < quantity) {
        throw httpError(409, `Insufficient stock for ${product.name} (only ${Number(product.quantity || 0)} left)`);
      }
      // The cashier may type the price actually charged. For goods that is a
      // discount off the catalogue price (never above it). Services may be
      // charged any agreed amount (e.g. a repair quoted per job); a service
      // with no catalogue price must have one supplied.
      const retailPrice = parseFloat(product.sellPrice) || 0;
      const wholesalePrice = product.wholesalePrice == null ? null : parseFloat(product.wholesalePrice);
      const getsWholesale = wholesaleSale && wholesalePrice != null && quantity >= (product.wholesaleMinQty || 1);
      if (getsWholesale) usedWholesale = true;
      const catalogPrice = getsWholesale ? wholesalePrice : retailPrice;
      let unitPrice = catalogPrice;
      if (item.price !== undefined && item.price !== null && item.price !== '') {
        const charged = roundMoney(Number(item.price));
        if (!Number.isFinite(charged) || charged < 0) {
          throw httpError(400, `Enter a valid amount for ${product.name}`);
        }
        if (!isService && charged > retailPrice + 0.005) {
          throw httpError(400, `${product.name} cannot be sold above its price of ${retailPrice}. Change the product price instead.`);
        }
        unitPrice = charged;
      }
      if (isService && !(unitPrice > 0)) {
        throw httpError(400, `Enter the amount charged for ${product.name}`);
      }
      const buyPrice = Number(product.buyPrice || 0);
      if (!isService && !isAdmin && unitPrice < catalogPrice && unitPrice < buyPrice - 0.005) {
        throw httpError(403, `${product.name} cannot be sold below its cost price. Ask an admin.`);
      }
      // A service charged above its listed price is an agreed price, not a
      // negative discount.
      const listPrice = Math.max(catalogPrice, unitPrice);
      listSubtotal += listPrice * quantity;
      const lineTotal = unitPrice * quantity;
      subtotal += lineTotal;
      if (!isService) {
        product.quantity = Number(product.quantity || 0) - quantity;
        await product.save({ transaction });
      }

      itemRecords.push({ productId: product.id, quantity, price: unitPrice, listPrice, costOfGoods: product.buyPrice || 0 });
    }

    let discountAmount = 0;
    if (discountMode === 'percentage') {
      discountAmount = (subtotal * discountValue) / 100;
    } else {
      discountAmount = discountValue;
    }

    // Staff discount limit, set by the admin: item price cuts plus the
    // sale-wide discount, as a share of the sale's catalogue value.
    const itemDiscounts = roundMoney(listSubtotal - subtotal);
    const totalDiscount = itemDiscounts + Math.min(discountAmount, subtotal);
    const staffLimit = settings && settings.maxDiscountPercent != null ? Number(settings.maxDiscountPercent) : null;
    if (!isAdmin && staffLimit != null && totalDiscount > 0 && listSubtotal > 0) {
      const givenPercent = (totalDiscount / listSubtotal) * 100;
      if (givenPercent > staffLimit + 0.01) {
        throw httpError(403, `Discount of ${givenPercent.toFixed(1)}% is above your limit of ${staffLimit}%. Ask an admin.`);
      }
    }

    const afterDiscount = Math.max(0, subtotal - discountAmount);
    const taxRate = settings ? parseFloat(settings.vat || 0) : 0;
    const taxAmount = (afterDiscount * taxRate) / 100;
    const total = afterDiscount + taxAmount;

    let creditAmount = 0;
    let amountPaid = total;
    let salePaymentSplits = paymentSplits || null;
    if (isCredit) {
      const deposit = roundMoney(Number(req.body.amountPaid || 0));
      if (!Number.isFinite(deposit) || deposit < 0) {
        throw httpError(400, 'Amount paid now must be 0 or more');
      }
      if (deposit >= roundMoney(total)) {
        throw httpError(400, 'Amount paid covers the full total; use a normal payment method instead of credit');
      }
      creditAmount = roundMoney(total - deposit);
      amountPaid = deposit;

      if (customer.creditLimit != null) {
        const outstanding = Number(
          (await Sale.sum('balanceDue', { where: { shopId: req.user.shopId, customerId: customer.id }, transaction })) || 0
        );
        const limit = Number(customer.creditLimit);
        if (outstanding + creditAmount > limit + 0.005) {
          throw httpError(
            409,
            `Credit limit exceeded for ${customer.name}: owes ${outstanding.toFixed(2)}, limit ${limit.toFixed(2)}, this sale adds ${creditAmount.toFixed(2)}`
          );
        }
      }

      salePaymentSplits = [
        ...(deposit > 0 ? [{ method: depositMethod, amount: deposit }] : []),
        { method: 'Credit', amount: creditAmount },
      ];
    }

    const sale = await Sale.create(
      {
        total,
        discount: discountAmount,
        discountType: discountMode,
        tax: taxRate,
        taxAmount,
        cashierId: saleCashierId,
        customerId: customer ? customer.id : null,
        shopId: req.user.shopId,
        paymentMethod,
        paymentSplits: salePaymentSplits,
        currency: saleCurrency,
        priceTier: usedWholesale ? 'wholesale' : 'retail',
        creditAmount,
        balanceDue: creditAmount,
        dueDate,
        clientRef,
        ...(soldAt ? { date: soldAt, createdAt: soldAt } : {}),
      },
      { transaction }
    );

    const saleItems = itemRecords.map((record) => ({ ...record, saleId: sale.id, shopId: req.user.shopId }));
    await SaleItem.bulkCreate(saleItems, { transaction });

    const receiptNumber = buildReceiptNumber(sale.id);
    await Receipt.create({ saleId: sale.id, receiptNumber, shopId: req.user.shopId, publicToken: newReceiptToken() }, { transaction });

    await transaction.commit();

    if (req.user.shopId) {
      await auditController.logAction(
        req.user.id,
        req.user.shopId,
        'CREATE',
        'SALE',
        sale.id,
        {
          total,
          discount: discountAmount,
          taxAmount,
          paymentMethod,
          currency: saleCurrency,
          items: itemRecords.length,
          ...(itemDiscounts > 0 ? { itemDiscounts } : {}),
          ...(isOffline ? { offline: true, soldAt } : {}),
          ...(isCredit ? { creditAmount, customerId: customer.id } : {}),
        },
        req
      );
    }

    res.status(201).json({
      saleId: sale.id,
      receipt: receiptNumber,
      priceTier: usedWholesale ? 'wholesale' : 'retail',
      total,
      discount: discountAmount,
      itemDiscounts,
      taxAmount,
      currency: saleCurrency,
      amountPaid,
      creditAmount,
      balanceDue: creditAmount,
      dueDate,
    });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    if (clientRef && error.name === 'SequelizeUniqueConstraintError') {
      try {
        const existing = await existingSaleResponse(req.user.shopId, clientRef);
        if (existing) return res.status(200).json(existing);
      } catch (lookupError) {
        return next(lookupError);
      }
    }
    next(error);
  }
};

// Paged and searchable: a busy shop has tens of thousands of sales, and
// returning them all at once was ~20 MB per request.
exports.listSales = async (req, res, next) => {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const q = String(req.query.q || '').trim();
    const where = { shopId: req.user.shopId };
    if (q) {
      const receipt = /^(?:sd-?)?0*(\d+)$/i.exec(q);
      if (receipt) {
        where.id = Number(receipt[1]);
      } else {
        const like = { [Op.iLike]: `%${q}%` };
        where[Op.or] = [{ '$customer.name$': like }, { '$customer.phone$': like }, { '$cashier.name$': like }];
      }
    }
    const sales = await Sale.findAll({
      where,
      include: [
        { model: User, as: 'cashier', attributes: ['id', 'name'] },
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'] },
        { model: Receipt, as: 'receipt' },
      ],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
      subQuery: false,
    });
    res.json(sales);
  } catch (error) {
    next(error);
  }
};

exports.getSale = async (req, res, next) => {
  try {
    const sale = await Sale.findOne({
      where: { id: req.params.id, shopId: req.user.shopId },
      include: [
        {
          model: SaleItem,
          as: 'items',
          where: { shopId: req.user.shopId },
          required: false,
          include: [{ model: Product, attributes: ['id', 'name', 'sellPrice', 'category', 'type'] }],
        },
        { model: User, as: 'cashier', attributes: ['id', 'name'] },
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone', 'whatsapp', 'email'] },
        { model: Receipt, as: 'receipt' },
      ],
    });
    
    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    res.json(sale);
  } catch (error) {
    next(error);
  }
};

// Everything the PDF needs for one sale of one shop.
async function loadReceiptData(saleId, shopId) {
  const [sale, settings] = await Promise.all([
    Sale.findOne({
      where: { id: saleId, shopId },
      include: [
        {
          model: SaleItem,
          as: 'items',
          where: { shopId },
          required: false,
          include: [{ model: Product, attributes: ['name', 'category', 'type'] }],
        },
        { model: User, as: 'cashier', attributes: ['id', 'name'] },
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone', 'email'] },
        { model: Receipt, as: 'receipt' },
      ],
    }),
    Setting.findOne({
      where: { shopId },
      include: [{ model: Shop, as: 'shop', attributes: ['id', 'name', 'slug'] }],
    }),
  ]);
  return { sale, settings };
}

async function sendReceiptPdf(res, sale, settings) {
  const number = sale.receipt?.receiptNumber || sale.id;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=receipt-${number}.pdf`);
  await generateReceiptPdf(res, sale, settings || {});
}

exports.getSaleReceipt = async (req, res, next) => {
  try {
    const { sale, settings } = await loadReceiptData(req.params.id, req.user.shopId);
    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }
    await sendReceiptPdf(res, sale, settings);
  } catch (error) {
    console.error('Receipt generation error:', error);
    next(error);
  }
};

// POST /api/sales/:id/share - the receipt's public link token, created on
// first use for sales made before links existed.
exports.shareReceipt = async (req, res, next) => {
  try {
    const receipt = await Receipt.findOne({ where: { saleId: req.params.id, shopId: req.user.shopId } });
    if (!receipt) {
      return res.status(404).json({ message: 'Sale not found' });
    }
    if (!receipt.publicToken) {
      await receipt.update({ publicToken: newReceiptToken() });
    }
    res.json({ token: receipt.publicToken });
  } catch (error) {
    next(error);
  }
};

// GET /api/public/receipts/:token - the customer's copy, no sign-in. The
// token is 144 random bits, so links cannot be guessed or enumerated.
exports.publicReceipt = async (req, res, next) => {
  try {
    const token = String(req.params.token || '');
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
      return res.status(404).json({ message: 'Receipt not found' });
    }
    const receipt = await Receipt.findOne({ where: { publicToken: token }, attributes: ['saleId', 'shopId'] });
    if (!receipt) {
      return res.status(404).json({ message: 'Receipt not found' });
    }
    const { sale, settings } = await loadReceiptData(receipt.saleId, receipt.shopId);
    if (!sale) {
      return res.status(404).json({ message: 'Receipt not found' });
    }
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    await sendReceiptPdf(res, sale, settings);
  } catch (error) {
    next(error);
  }
};

exports.closeBusinessDay = async (req, res, next) => {
  try {
    const now = new Date();
    const closureDate = localDateString(now);
    const existingClosure = await DayClosure.findOne({
      where: { shopId: req.user.shopId, closedForDate: closureDate },
      include: [{ model: User, as: 'closedBy', attributes: ['id', 'name'] }],
    });

    if (existingClosure) {
      return res.status(200).json({
        message: 'Business day was already closed for today.',
        closure: existingClosure,
        alreadyClosed: true,
      });
    }

    const metrics = await getMetricsForRange(req.user.shopId, startOfDay(now), endOfDay(now));
    const closure = await DayClosure.create({
      closedForDate: closureDate,
      closedByUserId: req.user.id,
      shopId: req.user.shopId,
      netSales: metrics.netSales,
      grossSales: metrics.grossSales,
      grossProfit: metrics.grossProfit,
      itemsSold: metrics.itemsSold,
      orderCount: metrics.orderCount,
      discountTotal: metrics.discountTotal,
    });

    const savedClosure = await DayClosure.findByPk(closure.id, {
      include: [{ model: User, as: 'closedBy', attributes: ['id', 'name'] }],
    });

    res.status(201).json({
      message: 'Business day closed successfully. Sales history remains available for reporting.',
      closure: savedClosure,
      alreadyClosed: false,
    });
  } catch (error) {
    next(error);
  }
};

exports.listDayClosures = async (req, res, next) => {
  try {
    const closures = await DayClosure.findAll({
      where: { shopId: req.user.shopId },
      include: [{ model: User, as: 'closedBy', attributes: ['id', 'name'] }],
      order: [['closedForDate', 'DESC'], ['createdAt', 'DESC']],
      limit: 10,
    });
    res.json(closures);
  } catch (error) {
    next(error);
  }
};

exports.createReturn = async (req, res, next) => {
  // Opened inside try: if the pool is exhausted the error must reach
  // next() instead of escaping as an unhandled rejection.
  let transaction;
  // Every early exit must release the transaction, otherwise the pooled
  // connection stays checked out and the API eventually stalls.
  const reject = async (status, message) => {
    await transaction.rollback();
    return res.status(status).json({ message });
  };
  try {
    transaction = await Sale.sequelize.transaction();
    const { items, reason } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return reject(400, 'Return must include at least one item');
    }

    // Lock the sale row so concurrent returns against the same sale are
    // processed one at a time and cannot jointly exceed what was sold.
    const sale = await Sale.findOne({
      where: { id: req.params.id, shopId: req.user.shopId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!sale) return reject(404, 'Sale not found');

    const saleItems = await SaleItem.findAll({ where: { saleId: sale.id }, transaction });
    const soldByProduct = new Map();
    const priceByProduct = new Map();
    for (const si of saleItems) {
      soldByProduct.set(si.productId, (soldByProduct.get(si.productId) || 0) + Number(si.quantity));
      if (!priceByProduct.has(si.productId)) priceByProduct.set(si.productId, parseFloat(si.price));
    }

    const previousReturns = await SaleReturn.findAll({ where: { saleId: sale.id }, attributes: ['id'], transaction });
    const returnedByProduct = new Map();
    if (previousReturns.length > 0) {
      const previousItems = await SaleReturnItem.findAll({
        where: { returnId: previousReturns.map((r) => r.id) },
        attributes: ['productId', 'quantity'],
        transaction,
      });
      for (const ri of previousItems) {
        returnedByProduct.set(ri.productId, (returnedByProduct.get(ri.productId) || 0) + Number(ri.quantity));
      }
    }

    // Merge duplicate lines for the same product before validating.
    const requested = new Map();
    for (const item of items) {
      const productId = Number(item.productId);
      const returnQty = Number(item.quantity);
      if (!Number.isFinite(returnQty) || returnQty <= 0) {
        return reject(400, `Return quantity must be a positive number for product ${item.productId}`);
      }
      requested.set(productId, (requested.get(productId) || 0) + returnQty);
    }

    let totalRefund = 0;
    const returnItems = [];

    for (const [productId, returnQty] of requested) {
      if (!soldByProduct.has(productId)) return reject(400, `Product ${productId} not in original sale`);
      const remaining = soldByProduct.get(productId) - (returnedByProduct.get(productId) || 0);
      if (returnQty > remaining) {
        return reject(400, `Cannot return more than sold for product ${productId} (${remaining} returnable)`);
      }
      const refundAmount = priceByProduct.get(productId) * returnQty;
      totalRefund += refundAmount;

      // Restore stock
      const product = await Product.findOne({
        where: { id: productId, shopId: req.user.shopId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (product && product.type !== 'service') {
        product.quantity = Number(product.quantity || 0) + returnQty;
        await product.save({ transaction });
      }

      returnItems.push({ productId, quantity: returnQty, refundAmount, shopId: req.user.shopId });
    }

    // On a credit sale the refund first cancels what is still owed; only the
    // remainder is handed back to the customer.
    const owed = Number(sale.balanceDue || 0);
    const creditReduction = roundMoney(Math.min(owed, totalRefund));
    const cashRefund = roundMoney(totalRefund - creditReduction);
    if (creditReduction > 0) {
      sale.balanceDue = roundMoney(owed - creditReduction);
      await sale.save({ transaction });
    }

    const saleReturn = await SaleReturn.create(
      { saleId: sale.id, reason: reason || null, totalRefund, processedByUserId: req.user.id, shopId: req.user.shopId },
      { transaction }
    );

    await SaleReturnItem.bulkCreate(
      returnItems.map((ri) => ({ ...ri, returnId: saleReturn.id })),
      { transaction }
    );

    await transaction.commit();
    res.status(201).json({ returnId: saleReturn.id, totalRefund, creditReduction, cashRefund, message: 'Return processed successfully' });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
};

exports.listReturns = async (req, res, next) => {
  try {
    const returns = await SaleReturn.findAll({
      where: { shopId: req.user.shopId },
      include: [
        { model: User, as: 'processedBy', attributes: ['id', 'name'] },
        { model: SaleReturnItem, as: 'items', include: [{ model: Product, as: 'product', attributes: ['id', 'name'] }] },
        { model: Sale, as: 'sale', attributes: ['id', 'total', 'createdAt'] },
      ],
      order: [['createdAt', 'DESC']],
    });
    res.json(returns);
  } catch (error) {
    next(error);
  }
};
