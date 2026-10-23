const { Customer, Sale } = require('../models');
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

// POST /api/customers/:id/reminders — the till opened WhatsApp with a debt
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
