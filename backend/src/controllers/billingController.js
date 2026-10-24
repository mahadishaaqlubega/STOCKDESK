const { Op } = require('sequelize');
const { Shop, User, SubscriptionPayment, PaymentRequest, sequelize } = require('../models');
const {
  getBillingConfig,
  saveBillingConfig,
  findPlan,
  computeStatus,
  nextPeriod,
  invalidateShopStatus,
  toWhatsappNumber,
  staffUsage,
} = require('../utils/subscription');
const { sendBillingEmail } = require('../services/emailService');

const METHODS = ['MTN Mobile Money', 'Airtel Money', 'Bank transfer', 'Cash'];
const BUSINESS_TYPES = [
  'Supermarket / general store', 'Hardware', 'Pharmacy / drug shop', 'Phone & electronics', 'Boutique / fashion',
  'Salon / barber', 'Restaurant / cafe / bar', 'Wholesale', 'Agro inputs', 'Stationery / bookshop', 'Other',
];

const clean = (value, max) => (value == null ? null : String(value).trim().slice(0, max) || null);
const money = (value) => Math.round(Number(value) || 0);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const ugx = (n, currency = 'UGX') => `${currency} ${money(n).toLocaleString('en-US')}`;

async function findOwner(shopId) {
  return User.findOne({
    where: { shopId, role: 'Admin' },
    attributes: ['id', 'name', 'username', 'email', 'isVerified'],
    order: [['createdAt', 'ASC']],
  });
}

function publicConfig(config) {
  return {
    currency: config.currency,
    trialDays: config.trialDays,
    graceDays: config.graceDays,
    plans: config.plans,
    payTo: config.payTo,
    supportWhatsapp: config.supportWhatsapp,
  };
}

function serializePayment(p) {
  return {
    id: p.id,
    shopId: p.shopId,
    plan: p.plan,
    months: p.months,
    amount: money(p.amount),
    method: p.method,
    reference: p.reference,
    payerPhone: p.payerPhone,
    status: p.status,
    note: p.note,
    requestId: p.requestId,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    reviewedAt: p.reviewedAt,
    createdAt: p.createdAt,
    shop: p.shop ? { id: p.shop.id, name: p.shop.name } : undefined,
    submittedBy: p.submittedBy ? { name: p.submittedBy.name, username: p.submittedBy.username } : undefined,
  };
}

function serializeRequest(r) {
  return {
    id: r.id,
    shopId: r.shopId,
    plan: r.plan,
    months: r.months,
    amount: money(r.amount),
    dueDate: r.dueDate,
    message: r.message,
    status: r.status,
    emailedAt: r.emailedAt,
    createdAt: r.createdAt,
    shop: r.shop ? { id: r.shop.id, name: r.shop.name } : undefined,
  };
}

async function emailOwner(shopId, message) {
  try {
    const owner = await findOwner(shopId);
    if (!owner?.email) return false;
    await sendBillingEmail(owner.email, message);
    return true;
  } catch (error) {
    console.error('[billing] email failed:', error.message);
    return false;
  }
}

// Applies a confirmed payment to the shop: extends paidUntil and sets the plan.
async function applyPayment(payment, shop, reviewerId, transaction) {
  const { start, end } = nextPeriod(shop, payment.months);
  payment.status = 'confirmed';
  payment.periodStart = start;
  payment.periodEnd = end;
  payment.reviewedByUserId = reviewerId;
  payment.reviewedAt = new Date();
  await payment.save({ transaction });
  shop.paidUntil = end;
  shop.plan = payment.plan;
  shop.lastBillingNotice = null;
  await shop.save({ transaction });
  if (payment.requestId) {
    await PaymentRequest.update({ status: 'paid' }, { where: { id: payment.requestId, shopId: shop.id }, transaction });
  } else {
    // A payment that covers the plan settles any open request for the shop.
    await PaymentRequest.update({ status: 'paid' }, { where: { shopId: shop.id, status: 'open' }, transaction });
  }
  invalidateShopStatus(shop.id);
  return { start, end };
}

// ---------------------------------------------------------------- shop side

exports.getStatus = async (req, res, next) => {
  try {
    const shop = await Shop.findByPk(req.user.shopId);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    const config = await getBillingConfig();
    const isAdmin = req.user.role === 'Admin';
    const [openRequests, pendingPayments] = await Promise.all([
      PaymentRequest.findAll({ where: { shopId: shop.id, status: 'open' }, order: [['createdAt', 'DESC']] }),
      isAdmin ? SubscriptionPayment.findAll({ where: { shopId: shop.id, status: 'pending' }, order: [['createdAt', 'DESC']] }) : [],
    ]);
    res.json({
      status: computeStatus(shop, config),
      staff: await staffUsage(shop, config),
      config: publicConfig(config),
      openRequests: openRequests.map(serializeRequest),
      pendingPayments: pendingPayments.map(serializePayment),
      profile: isAdmin ? { ownerPhone: shop.ownerPhone, businessType: shop.businessType, location: shop.location } : undefined,
      businessTypes: BUSINESS_TYPES,
      methods: METHODS,
    });
  } catch (error) {
    next(error);
  }
};

exports.listPayments = async (req, res, next) => {
  try {
    const payments = await SubscriptionPayment.findAll({
      where: { shopId: req.user.shopId },
      order: [['createdAt', 'DESC']],
      limit: 50,
    });
    res.json({ payments: payments.map(serializePayment) });
  } catch (error) {
    next(error);
  }
};

exports.submitPayment = async (req, res, next) => {
  try {
    const shopId = req.user.shopId;
    const config = await getBillingConfig();
    const method = METHODS.includes(req.body.method) ? req.body.method : null;
    const reference = clean(req.body.reference, 80);
    const payerPhone = clean(req.body.payerPhone, 32);
    const months = Math.min(12, Math.max(1, parseInt(req.body.months, 10) || 1));
    let plan = findPlan(config, req.body.plan);
    let amount;
    let requestId = null;

    if (req.body.requestId) {
      const request = await PaymentRequest.findOne({ where: { id: req.body.requestId, shopId, status: 'open' } });
      if (!request) return res.status(404).json({ message: 'That payment request is no longer open.' });
      requestId = request.id;
      plan = findPlan(config, request.plan) || plan;
      amount = money(request.amount);
    }

    if (!plan) return res.status(400).json({ message: 'Choose a plan.' });
    if (!method) return res.status(400).json({ message: 'Choose how you paid.' });
    if (method !== 'Cash' && (!reference || reference.length < 4)) {
      return res.status(400).json({ message: 'Enter the transaction ID from your payment message.' });
    }
    if (amount == null) amount = plan.price * months;

    if (reference) {
      const duplicate = await SubscriptionPayment.findOne({
        where: { reference: { [Op.iLike]: reference }, status: { [Op.ne]: 'rejected' } },
      });
      if (duplicate) return res.status(409).json({ message: 'This transaction ID has already been submitted.' });
    }

    const payment = await SubscriptionPayment.create({
      shopId,
      plan: plan.key,
      months: requestId ? (await PaymentRequest.findByPk(requestId)).months : months,
      amount,
      method,
      reference,
      payerPhone,
      status: 'pending',
      requestId,
      submittedByUserId: req.user.id,
    });

    const notify = process.env.PLATFORM_BILLING_EMAIL;
    if (notify) {
      const shop = await Shop.findByPk(shopId, { attributes: ['name'] });
      sendBillingEmail(notify, {
        subject: `Payment to confirm: ${shop?.name || `shop ${shopId}`}`,
        heading: 'A shop sent a payment',
        lines: [
          `${shop?.name || 'A shop'} says it paid ${ugx(amount, config.currency)} for the ${plan.name} plan (${payment.months} month${payment.months > 1 ? 's' : ''}).`,
          `Method: ${method}. Transaction ID: ${reference || 'none'}. Paid from: ${payerPhone || 'not given'}.`,
          'Check your Mobile Money statement, then confirm or reject it in the owner console.',
        ],
        ctaLabel: 'Open owner console',
        ctaPath: '/app/owner-billing',
      }).catch((e) => console.error('[billing] notify failed:', e.message));
    }

    res.status(201).json({ payment: serializePayment(payment) });
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const shop = await Shop.findByPk(req.user.shopId);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    if ('ownerPhone' in req.body) shop.ownerPhone = clean(req.body.ownerPhone, 32);
    if ('businessType' in req.body) shop.businessType = clean(req.body.businessType, 60);
    if ('location' in req.body) shop.location = clean(req.body.location, 120);
    await shop.save();
    res.json({ profile: { ownerPhone: shop.ownerPhone, businessType: shop.businessType, location: shop.location } });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------- platform owner

exports.adminOverview = async (req, res, next) => {
  try {
    const config = await getBillingConfig({ fresh: true });
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [shops, pending, recent, thisMonth, lastMonth, openRequests] = await Promise.all([
      Shop.findAll({ attributes: ['id', 'name', 'plan', 'trialEndsAt', 'paidUntil', 'isActive', 'ownerPhone', 'createdAt'] }),
      SubscriptionPayment.findAll({
        where: { status: 'pending' },
        include: [
          { model: Shop, as: 'shop', attributes: ['id', 'name'] },
          { model: User, as: 'submittedBy', attributes: ['name', 'username'], required: false },
        ],
        order: [['createdAt', 'ASC']],
      }),
      SubscriptionPayment.findAll({
        where: { status: { [Op.in]: ['confirmed', 'rejected'] } },
        include: [{ model: Shop, as: 'shop', attributes: ['id', 'name'] }],
        order: [['updatedAt', 'DESC']],
        limit: 15,
      }),
      SubscriptionPayment.sum('amount', { where: { status: 'confirmed', reviewedAt: { [Op.gte]: monthStart } } }),
      SubscriptionPayment.sum('amount', { where: { status: 'confirmed', reviewedAt: { [Op.gte]: lastMonthStart, [Op.lt]: monthStart } } }),
      PaymentRequest.count({ where: { status: 'open' } }),
    ]);

    const owners = await User.findAll({
      where: { role: 'Admin', shopId: { [Op.in]: shops.map((s) => s.id) } },
      attributes: ['shopId', 'name', 'email', 'createdAt'],
      order: [['createdAt', 'ASC']],
    });
    const ownerByShop = new Map();
    owners.forEach((o) => { if (!ownerByShop.has(o.shopId)) ownerByShop.set(o.shopId, o); });

    const counts = { trial: 0, active: 0, past_due: 0, expired: 0 };
    let monthlyRecurring = 0;
    const byPlan = new Map(config.plans.map((p) => [p.key, { key: p.key, name: p.name, price: p.price, paying: 0, lapsed: 0 }]));
    const attention = [];
    for (const shop of shops) {
      const st = computeStatus(shop, config, now);
      counts[st.state] += 1;
      if (st.state === 'active') monthlyRecurring += findPlan(config, shop.plan)?.price || 0;
      const planRow = byPlan.get(shop.plan);
      if (planRow && st.state === 'active') planRow.paying += 1;
      if (planRow && (st.state === 'past_due' || st.state === 'expired')) planRow.lapsed += 1;
      const soon = (st.state === 'trial' || st.state === 'active') && st.daysLeft != null && st.daysLeft <= 7;
      if (soon || st.state === 'past_due' || st.state === 'expired') {
        const owner = ownerByShop.get(shop.id);
        attention.push({
          id: shop.id,
          name: shop.name,
          state: st.state,
          daysLeft: st.daysLeft,
          endsAt: st.endsAt,
          plan: shop.plan,
          ownerName: owner?.name || null,
          ownerEmail: owner?.email || null,
          ownerPhone: shop.ownerPhone,
          whatsapp: toWhatsappNumber(shop.ownerPhone),
        });
      }
    }
    attention.sort((a, b) => (a.endsAt ? new Date(a.endsAt) : 0) - (b.endsAt ? new Date(b.endsAt) : 0));

    res.json({
      config: publicConfig(config),
      summary: {
        ...counts,
        totalShops: shops.length,
        pendingPayments: pending.length,
        openRequests,
        revenueThisMonth: money(thisMonth),
        revenueLastMonth: money(lastMonth),
        monthlyRecurring,
      },
      plans: [...byPlan.values()].map((p) => ({ ...p, monthly: p.paying * p.price })),
      pending: pending.map(serializePayment),
      recent: recent.map(serializePayment),
      attention,
    });
  } catch (error) {
    next(error);
  }
};

exports.updateConfig = async (req, res, next) => {
  try {
    const config = await saveBillingConfig(req.body || {});
    invalidateShopStatus();
    res.json({ config: publicConfig(config) });
  } catch (error) {
    next(error);
  }
};

exports.listContacts = async (req, res, next) => {
  try {
    const config = await getBillingConfig();
    const shops = await Shop.findAll({
      attributes: ['id', 'name', 'plan', 'trialEndsAt', 'paidUntil', 'ownerPhone', 'businessType', 'location', 'createdAt', 'isActive'],
      order: [['createdAt', 'DESC']],
    });
    const owners = await User.findAll({
      where: { role: 'Admin', shopId: { [Op.in]: shops.map((s) => s.id) } },
      attributes: ['shopId', 'name', 'username', 'email', 'isVerified', 'createdAt'],
      order: [['createdAt', 'ASC']],
    });
    const ownerByShop = new Map();
    owners.forEach((o) => { if (!ownerByShop.has(o.shopId)) ownerByShop.set(o.shopId, o); });
    res.json({
      contacts: shops.map((shop) => {
        const st = computeStatus(shop, config);
        const owner = ownerByShop.get(shop.id);
        return {
          shopId: shop.id,
          shopName: shop.name,
          ownerName: owner?.name || null,
          ownerEmail: owner?.email || null,
          emailVerified: owner?.isVerified || false,
          ownerPhone: shop.ownerPhone,
          whatsapp: toWhatsappNumber(shop.ownerPhone),
          businessType: shop.businessType,
          location: shop.location,
          state: st.state,
          plan: shop.plan,
          daysLeft: st.daysLeft,
          endsAt: st.endsAt,
          joined: shop.createdAt,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
};

exports.shopBilling = async (req, res, next) => {
  try {
    const shop = await Shop.findByPk(req.params.id);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    const config = await getBillingConfig();
    const [payments, requests, owner] = await Promise.all([
      SubscriptionPayment.findAll({ where: { shopId: shop.id }, order: [['createdAt', 'DESC']], limit: 50 }),
      PaymentRequest.findAll({ where: { shopId: shop.id }, order: [['createdAt', 'DESC']], limit: 20 }),
      findOwner(shop.id),
    ]);
    res.json({
      status: computeStatus(shop, config),
      staff: { ...(await staffUsage(shop, config)), override: shop.staffLimitOverride },
      config: publicConfig(config),
      profile: {
        ownerPhone: shop.ownerPhone,
        whatsapp: toWhatsappNumber(shop.ownerPhone),
        businessType: shop.businessType,
        location: shop.location,
        billingNotes: shop.billingNotes,
        ownerName: owner?.name || null,
        ownerEmail: owner?.email || null,
      },
      payments: payments.map(serializePayment),
      requests: requests.map(serializeRequest),
      methods: METHODS,
      businessTypes: BUSINESS_TYPES,
    });
  } catch (error) {
    next(error);
  }
};

exports.extendTrial = async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.body.days, 10) || 0));
    if (!days) return res.status(400).json({ message: 'Enter how many days to add.' });
    const shop = await Shop.findByPk(req.params.id);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    const base = shop.trialEndsAt && new Date(shop.trialEndsAt) > new Date() ? new Date(shop.trialEndsAt) : new Date();
    shop.trialEndsAt = new Date(base.getTime() + days * 86400000);
    shop.lastBillingNotice = null;
    await shop.save();
    invalidateShopStatus(shop.id);
    res.json({ status: computeStatus(shop, await getBillingConfig()) });
  } catch (error) {
    next(error);
  }
};

exports.recordPayment = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const config = await getBillingConfig();
    const shop = await Shop.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!shop) { await t.rollback(); return res.status(404).json({ message: 'Shop not found' }); }
    const plan = findPlan(config, req.body.plan);
    if (!plan) { await t.rollback(); return res.status(400).json({ message: 'Choose a plan.' }); }
    const months = Math.min(24, Math.max(1, parseInt(req.body.months, 10) || 1));
    const method = METHODS.includes(req.body.method) ? req.body.method : 'Cash';
    const amount = req.body.amount != null && req.body.amount !== '' ? money(req.body.amount) : plan.price * months;
    const payment = await SubscriptionPayment.create({
      shopId: shop.id,
      plan: plan.key,
      months,
      amount,
      method,
      reference: clean(req.body.reference, 80),
      note: clean(req.body.note, 500),
      status: 'pending',
      submittedByUserId: req.user.id,
    }, { transaction: t });
    const { end } = await applyPayment(payment, shop, req.user.id, t);
    await t.commit();
    emailOwner(shop.id, {
      subject: `Payment received for ${shop.name}`,
      heading: 'Thank you, your payment is confirmed',
      lines: [
        `We received ${ugx(amount, config.currency)} for the ${plan.name} plan.`,
        `${shop.name} is paid up until ${fmtDate(end)}.`,
      ],
    });
    res.status(201).json({ payment: serializePayment(payment), status: computeStatus(shop, config) });
  } catch (error) {
    if (!t.finished) await t.rollback();
    next(error);
  }
};

exports.confirmPayment = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const config = await getBillingConfig();
    const payment = await SubscriptionPayment.findByPk(req.params.paymentId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!payment) { await t.rollback(); return res.status(404).json({ message: 'Payment not found' }); }
    if (payment.status !== 'pending') { await t.rollback(); return res.status(409).json({ message: `This payment is already ${payment.status}.` }); }
    const shop = await Shop.findByPk(payment.shopId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!shop) { await t.rollback(); return res.status(404).json({ message: 'Shop not found' }); }
    if (req.body.amount != null && req.body.amount !== '') payment.amount = money(req.body.amount);
    if (req.body.note) payment.note = clean(req.body.note, 500);
    const { end } = await applyPayment(payment, shop, req.user.id, t);
    await t.commit();
    const plan = findPlan(config, payment.plan);
    emailOwner(shop.id, {
      subject: `Payment confirmed for ${shop.name}`,
      heading: 'Thank you, your payment is confirmed',
      lines: [
        `We confirmed your ${payment.method} payment of ${ugx(payment.amount, config.currency)}${payment.reference ? ` (transaction ${payment.reference})` : ''} for the ${plan?.name || payment.plan} plan.`,
        `${shop.name} is paid up until ${fmtDate(end)}.`,
      ],
    });
    res.json({ payment: serializePayment(payment), status: computeStatus(shop, config) });
  } catch (error) {
    if (!t.finished) await t.rollback();
    next(error);
  }
};

exports.rejectPayment = async (req, res, next) => {
  try {
    const payment = await SubscriptionPayment.findByPk(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (payment.status !== 'pending') return res.status(409).json({ message: `This payment is already ${payment.status}.` });
    payment.status = 'rejected';
    payment.note = clean(req.body.note, 500) || 'We could not find this payment on our statement.';
    payment.reviewedByUserId = req.user.id;
    payment.reviewedAt = new Date();
    await payment.save();
    const config = await getBillingConfig();
    emailOwner(payment.shopId, {
      subject: 'We could not confirm your StockDesk payment',
      heading: 'Payment not confirmed',
      lines: [
        `We could not confirm the ${payment.method} payment of ${ugx(payment.amount, config.currency)}${payment.reference ? ` with transaction ID ${payment.reference}` : ''}.`,
        `Reason: ${payment.note}`,
        'Please check the transaction ID and submit it again, or message us on WhatsApp and we will sort it out.',
      ],
    });
    res.json({ payment: serializePayment(payment) });
  } catch (error) {
    next(error);
  }
};

exports.createRequest = async (req, res, next) => {
  try {
    const config = await getBillingConfig();
    const shop = await Shop.findByPk(req.params.id);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    const plan = findPlan(config, req.body.plan || shop.plan || 'starter');
    if (!plan) return res.status(400).json({ message: 'Choose a plan.' });
    const months = Math.min(24, Math.max(1, parseInt(req.body.months, 10) || 1));
    const amount = req.body.amount != null && req.body.amount !== '' ? money(req.body.amount) : plan.price * months;
    const dueDate = req.body.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(req.body.dueDate) ? req.body.dueDate : null;
    const message = clean(req.body.message, 1000);

    const request = await PaymentRequest.create({
      shopId: shop.id,
      plan: plan.key,
      months,
      amount,
      dueDate,
      message,
      status: 'open',
      createdByUserId: req.user.id,
    });

    let emailed = false;
    if (req.body.sendEmail !== false) {
      const payLines = [config.payTo.mtnNumber && `MTN Mobile Money: ${config.payTo.mtnNumber}`, config.payTo.airtelNumber && `Airtel Money: ${config.payTo.airtelNumber}`]
        .filter(Boolean)
        .join(' · ');
      emailed = await emailOwner(shop.id, {
        subject: `Payment request for ${shop.name}: ${ugx(amount, config.currency)}`,
        heading: 'Your StockDesk payment request',
        lines: [
          message || `Please pay ${ugx(amount, config.currency)} for the ${plan.name} plan (${months} month${months > 1 ? 's' : ''}) to keep ${shop.name} running.`,
          dueDate ? `Due by ${fmtDate(dueDate)}.` : null,
          payLines ? `Pay to ${config.payTo.accountName}: ${payLines}.` : null,
          'After paying, open Billing in StockDesk and enter the transaction ID so we can confirm it.',
        ].filter(Boolean),
        ctaLabel: 'Pay now',
      });
      if (emailed) {
        request.emailedAt = new Date();
        await request.save();
      }
    }
    res.status(201).json({ request: serializeRequest(request), emailed });
  } catch (error) {
    next(error);
  }
};

exports.cancelRequest = async (req, res, next) => {
  try {
    const request = await PaymentRequest.findByPk(req.params.requestId);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.status !== 'open') return res.status(409).json({ message: `This request is already ${request.status}.` });
    request.status = 'cancelled';
    await request.save();
    res.json({ request: serializeRequest(request) });
  } catch (error) {
    next(error);
  }
};

exports.updateShopProfile = async (req, res, next) => {
  try {
    const shop = await Shop.findByPk(req.params.id);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    if ('ownerPhone' in req.body) shop.ownerPhone = clean(req.body.ownerPhone, 32);
    if ('businessType' in req.body) shop.businessType = clean(req.body.businessType, 60);
    if ('location' in req.body) shop.location = clean(req.body.location, 120);
    if ('billingNotes' in req.body) shop.billingNotes = clean(req.body.billingNotes, 2000);
    if ('staffLimitOverride' in req.body) {
      const v = req.body.staffLimitOverride;
      if (v === null || v === '') shop.staffLimitOverride = null;
      else {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0 || n > 500) return res.status(400).json({ message: 'Staff limit must be a whole number from 0 to 500, or empty for the plan limit.' });
        shop.staffLimitOverride = n;
      }
    }
    if ('plan' in req.body) {
      const config = await getBillingConfig();
      shop.plan = findPlan(config, req.body.plan) ? req.body.plan : null;
    }
    await shop.save();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

exports.setShopActive = async (req, res, next) => {
  try {
    const shop = await Shop.findByPk(req.params.id);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    shop.isActive = Boolean(req.body.isActive);
    await shop.save();
    invalidateShopStatus(shop.id);
    res.json({ isActive: shop.isActive });
  } catch (error) {
    next(error);
  }
};

exports.BUSINESS_TYPES = BUSINESS_TYPES;
