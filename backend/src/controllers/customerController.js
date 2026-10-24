const { Customer, CustomerPrice, Product, Sale } = require('../models');
const auditController = require('./auditController');
const { Op, fn, col } = require('sequelize');

function normalizeCustomerPayload(body, { allowCreditLimit = false } = {}) {
  const payload = {
    name: String(body.name || '').trim(),
    phone: body.phone ? String(body.phone).trim().slice(0, 32) : null,
    whatsapp: body.whatsapp ? String(body.whatsapp).trim().slice(0, 32) : null,
    email: body.email ? String(body.email).trim().toLowerCase() : null,
    address: body.address ? String(body.address).trim() : null,
    notes: body.notes ? String(body.notes).trim() : null,
    isActive: body.isActive !== false,
  };

  // Only admins decide who buys at wholesale prices or gets a loyalty discount.
  if (allowCreditLimit && body.priceTier !== undefined) {
    payload.priceTier = body.priceTier === 'wholesale' ? 'wholesale' : 'retail';
  }
  if (allowCreditLimit && body.loyaltyPercent !== undefined) {
    if (body.loyaltyPercent === null || body.loyaltyPercent === '' || Number(body.loyaltyPercent) === 0) {
      payload.loyaltyPercent = null;
    } else {
      const pct = Number(body.loyaltyPercent);
      if (!Number.isFinite(pct) || pct < 0 || pct > 90) {
        throw Object.assign(new Error('Loyalty discount must be between 0 and 90%'), { status: 400 });
      }
      payload.loyaltyPercent = pct;
    }
  }

  // Only admins may set how much a customer can owe; empty means no limit.
  if (allowCreditLimit && body.creditLimit !== undefined) {
    if (body.creditLimit === null || body.creditLimit === '') {
      payload.creditLimit = null;
    } else {
      const limit = Number(body.creditLimit);
      if (!Number.isFinite(limit) || limit < 0) {
        throw Object.assign(new Error('Credit limit must be 0 or more'), { status: 400 });
      }
      payload.creditLimit = limit;
    }
  }

  return payload;
}

exports.listCustomers = async (req, res, next) => {
  try {
    const { search } = req.query;
    const where = { shopId: req.user.shopId };

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const customers = await Customer.findAll({
      where,
      attributes: {
        include: [
          [fn('COUNT', col('sales.id')), 'salesCount'],
          [fn('COALESCE', fn('SUM', col('sales.balanceDue')), 0), 'balance'],
        ],
      },
      include: [
        {
          model: Sale,
          as: 'sales',
          attributes: [],
          required: false,
        },
      ],
      group: ['Customer.id'],
      order: [['name', 'ASC']],
    });

    res.json(customers);
  } catch (error) {
    next(error);
  }
};

exports.getCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    res.json(customer);
  } catch (error) {
    next(error);
  }
};

exports.createCustomer = async (req, res, next) => {
  try {
    const payload = normalizeCustomerPayload(req.body, { allowCreditLimit: req.user.role === 'Admin' });
    if (!payload.name) {
      return res.status(400).json({ message: 'Customer name is required' });
    }

    const customer = await Customer.create({
      ...payload,
      shopId: req.user.shopId,
    });

    res.status(201).json(customer);
  } catch (error) {
    next(error);
  }
};

exports.updateCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const payload = normalizeCustomerPayload(req.body, { allowCreditLimit: req.user.role === 'Admin' });
    if (!payload.name) {
      return res.status(400).json({ message: 'Customer name is required' });
    }

    await customer.update(payload);
    res.json(customer);
  } catch (error) {
    next(error);
  }
};

exports.deleteCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const linkedSales = await Sale.count({ where: { customerId: customer.id, shopId: req.user.shopId } });
    if (linkedSales > 0) {
      return res.status(400).json({ message: 'Customer has sales history and cannot be deleted' });
    }

    await customer.destroy();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// POST /api/customers/:id/reminders - the till opened WhatsApp with a debt
// reminder; remember when, and log who sent it.
exports.recordReminder = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    const channel = req.body.channel === 'sms' ? 'sms' : 'whatsapp';
    await customer.update({ lastReminderAt: new Date() });
    await auditController.logAction(
      req.user.id,
      req.user.shopId,
      'REMIND',
      'CUSTOMER',
      customer.id,
      { channel, balance: Number(req.body.balance) || undefined },
      req
    );
    res.json({ id: customer.id, lastReminderAt: customer.lastReminderAt });
  } catch (error) {
    next(error);
  }
};

// Special prices saved for one customer. Readable by the till; only admins
// change them. A price must sit between the product's wholesale price (or cost
// when it has none) and its retail price.
exports.listPrices = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { id: req.params.id, shopId: req.user.shopId }, attributes: ['id'] });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    const rows = await CustomerPrice.findAll({
      where: { shopId: req.user.shopId, customerId: customer.id },
      include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'sellPrice', 'wholesalePrice', 'buyPrice', 'category'] }],
      order: [['updatedAt', 'DESC']],
    });
    res.json({
      prices: rows.map((r) => ({
        productId: r.productId,
        price: Number(r.price),
        updatedAt: r.updatedAt,
        product: r.product ? {
          id: r.product.id,
          name: r.product.name,
          category: r.product.category,
          sellPrice: Number(r.product.sellPrice),
          wholesalePrice: r.product.wholesalePrice == null ? null : Number(r.product.wholesalePrice),
        } : null,
      })),
    });
  } catch (error) {
    next(error);
  }
};

exports.setPrice = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { id: req.params.id, shopId: req.user.shopId }, attributes: ['id', 'name'] });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    const product = await Product.findOne({ where: { id: req.params.productId, shopId: req.user.shopId } });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.type === 'service') return res.status(400).json({ message: 'Services are priced at the counter, so they have no saved price.' });
    const price = Number(req.body.price);
    const retail = Number(product.sellPrice) || 0;
    // Admins set these, so they may go below the wholesale price, but never
    // below cost (protects against a mistyped price selling at a loss).
    const floor = Number(product.buyPrice) || 0;
    if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ message: 'Enter a price' });
    if (price > retail + 0.005) return res.status(400).json({ message: `The price can't be above the retail price of ${retail}.` });
    if (price < floor - 0.005) return res.status(400).json({ message: `The price can't be below the cost price of ${floor}.` });
    const [row] = await CustomerPrice.findOrBuild({ where: { shopId: req.user.shopId, customerId: customer.id, productId: product.id } });
    row.price = price;
    row.updatedByUserId = req.user.id;
    await row.save();
    await auditController.logAction(req.user.id, req.user.shopId, 'UPDATE', 'CUSTOMER_PRICE', customer.id, { productId: product.id, product: product.name, price }, req);
    res.json({ productId: product.id, price });
  } catch (error) {
    next(error);
  }
};

exports.deletePrice = async (req, res, next) => {
  try {
    const removed = await CustomerPrice.destroy({ where: { shopId: req.user.shopId, customerId: req.params.id, productId: req.params.productId } });
    if (!removed) return res.status(404).json({ message: 'No saved price for this product' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// GET /customers/:id/statement.pdf - what the customer owes, sale by sale.
exports.statementPdf = async (req, res, next) => {
  try {
    const { customerStatementPdf } = require('../services/customerEmails');
    const doc = await customerStatementPdf(req.user.shopId, req.params.id);
    if (!doc) return res.status(404).json({ message: 'Customer not found' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${doc.filename}"`);
    res.send(doc.pdf);
  } catch (error) {
    next(error);
  }
};
