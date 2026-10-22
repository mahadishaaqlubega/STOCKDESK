const { Sale, SaleItem, Product, Receipt, User, Setting, Shop, Customer, DayClosure, SaleReturn, SaleReturnItem } = require('../models');
const { generateReceiptPdf } = require('../utils/receiptGenerator');
const { startOfDay, endOfDay, getMetricsForRange } = require('../utils/businessMetrics');
const { Op } = require('sequelize');
const auditController = require('./auditController');

function buildReceiptNumber(id) {
  return `SD-${String(id).padStart(6, '0')}`;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

exports.createSale = async (req, res, next) => {
  const transaction = await Sale.sequelize.transaction();
  try {
    const { items, paymentMethod, paymentSplits, currency, discount = 0, discountType = 'fixed', customerId = null } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      throw httpError(400, 'Sale must include at least one item');
    }

    // Validate payment method, discount and split payments before any writes.
    const allowedPaymentMethods = ['Cash', 'Card', 'Mobile Money', 'Split'];
    if (!allowedPaymentMethods.includes(paymentMethod)) {
      throw Object.assign(new Error('Invalid payment method'), { status: 400 });
    }

    const discountValue = Number(discount);
    if (!Number.isFinite(discountValue) || discountValue < 0) {
      throw Object.assign(new Error('Discount must be a non-negative number'), { status: 400 });
    }
    if (!['fixed', 'percentage'].includes(discountType)) {
      throw Object.assign(new Error('discountType must be "fixed" or "percentage"'), { status: 400 });
    }
    const discountMode = discountType === 'percentage' ? 'percentage' : 'fixed';

    if (paymentSplits != null) {
      if (!Array.isArray(paymentSplits) || paymentSplits.length === 0) {
        throw Object.assign(new Error('paymentSplits must be a non-empty array'), { status: 400 });
      }
      for (const split of paymentSplits) {
        const splitMethod = split && split.method;
        const splitAmount = Number(split && split.amount);
        if (!allowedPaymentMethods.includes(splitMethod) || !Number.isFinite(splitAmount) || splitAmount <= 0) {
          throw Object.assign(new Error('Each payment split must have a valid method and a positive amount'), { status: 400 });
        }
      }
    }

    const settings = await Setting.findOne({
      where: { shopId: req.user.shopId },
      include: [{ model: Shop, as: 'shop', attributes: ['id', 'name', 'slug'] }],
    });
    const saleCurrency = currency || (settings && settings.currency) || 'USD';

    let customer = null;
    if (customerId) {
      customer = await Customer.findOne({ where: { id: customerId, shopId: req.user.shopId }, transaction });
      if (!customer) {
        throw httpError(404, 'Selected customer not found');
      }
    }

    let subtotal = 0;
    const itemRecords = [];

    for (const item of items) {
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw Object.assign(new Error('Item quantity must be a positive number'), { status: 400 });
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
      if (Number(product.quantity || 0) < quantity) {
        throw httpError(409, `Insufficient stock for ${product.name} (only ${Number(product.quantity || 0)} left)`);
      }
      const lineTotal = parseFloat(product.sellPrice) * quantity;
      subtotal += lineTotal;
      product.quantity = Number(product.quantity || 0) - quantity;
      await product.save({ transaction });

      itemRecords.push({ productId: product.id, quantity, price: product.sellPrice, costOfGoods: product.buyPrice || 0 });
    }

    let discountAmount = 0;
    if (discountMode === 'percentage') {
      discountAmount = (subtotal * discountValue) / 100;
    } else {
      discountAmount = discountValue;
    }

    const afterDiscount = Math.max(0, subtotal - discountAmount);
    const taxRate = settings ? parseFloat(settings.vat || 0) : 0;
    const taxAmount = (afterDiscount * taxRate) / 100;
    const total = afterDiscount + taxAmount;

    const sale = await Sale.create(
      {
        total,
        discount: discountAmount,
        discountType: discountMode,
        tax: taxRate,
        taxAmount,
        cashierId: req.user.id,
        customerId: customer ? customer.id : null,
        shopId: req.user.shopId,
        paymentMethod,
        paymentSplits: paymentSplits || null,
        currency: saleCurrency,
      },
      { transaction }
    );

    const saleItems = itemRecords.map((record) => ({ ...record, saleId: sale.id, shopId: req.user.shopId }));
    await SaleItem.bulkCreate(saleItems, { transaction });

    const receiptNumber = buildReceiptNumber(sale.id);
    const receipt = await Receipt.create({ saleId: sale.id, receiptNumber, shopId: req.user.shopId }, { transaction });

    await transaction.commit();

    if (req.user.shopId) {
      await auditController.logAction(
        req.user.id,
        req.user.shopId,
        'CREATE',
        'SALE',
        sale.id,
        { total, discount: discountAmount, taxAmount, paymentMethod, currency: saleCurrency, items: itemRecords.length },
        req
      );
    }

    res.status(201).json({ saleId: sale.id, receipt: receiptNumber, total, discount: discountAmount, taxAmount, currency: saleCurrency });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  }
};

exports.listSales = async (req, res, next) => {
  try {
    const sales = await Sale.findAll({
      where: { shopId: req.user.shopId },
      include: [
        { model: User, as: 'cashier', attributes: ['id', 'name'] },
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'] },
        { model: Receipt, as: 'receipt' },
      ],
      order: [['createdAt', 'DESC']],
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
          include: [{ model: Product, attributes: ['id', 'name', 'sellPrice'] }],
        },
        { model: User, as: 'cashier', attributes: ['id', 'name'] },
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone', 'email'] },
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

exports.getSaleReceipt = async (req, res, next) => {
  try {
    const sale = await Sale.findOne({
      where: { id: req.params.id, shopId: req.user.shopId },
      include: [
        {
          model: SaleItem,
          as: 'items',
          where: { shopId: req.user.shopId },
          required: false,
          include: [{ model: Product, attributes: ['name'] }],
        },
        { model: User, as: 'cashier', attributes: ['id', 'name'] },
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone', 'email'] },
        { model: Receipt, as: 'receipt' },
      ],
    });
    const settings = await Setting.findOne({
      where: { shopId: req.user.shopId },
      include: [{ model: Shop, as: 'shop', attributes: ['id', 'name', 'slug'] }],
    });
    
    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=receipt-${sale.id}.pdf`);
    
    await generateReceiptPdf(res, sale, settings);
  } catch (error) {
    console.error('Receipt generation error:', error);
    next(error);
  }
};

exports.closeBusinessDay = async (req, res, next) => {
  try {
    const now = new Date();
    const closureDate = startOfDay(now).toISOString().slice(0, 10);
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
  const transaction = await Sale.sequelize.transaction();
  // Every early exit must release the transaction, otherwise the pooled
  // connection stays checked out and the API eventually stalls.
  const reject = async (status, message) => {
    await transaction.rollback();
    return res.status(status).json({ message });
  };
  try {
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
      if (product) {
        product.quantity = Number(product.quantity || 0) + returnQty;
        await product.save({ transaction });
      }

      returnItems.push({ productId, quantity: returnQty, refundAmount, shopId: req.user.shopId });
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
    res.status(201).json({ returnId: saleReturn.id, totalRefund, message: 'Return processed successfully' });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
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
