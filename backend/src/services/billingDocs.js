// Builds StockDesk invoices and payment receipts for a shop as PDF buffers.

const { Shop, User, SubscriptionPayment, PaymentRequest } = require('../models');
const { getBillingConfig, findPlan } = require('../utils/subscription');
const { generateBillingPdf } = require('../utils/billingPdf');

const pad = (n) => String(n).padStart(6, '0');

async function shopParty(shop) {
  const owner = await User.findOne({ where: { shopId: shop.id, role: 'Admin' }, attributes: ['name', 'username', 'email'], order: [['createdAt', 'ASC']] });
  return {
    name: shop.name,
    owner: owner?.name || owner?.username || null,
    email: owner?.email || null,
    phone: shop.ownerPhone || null,
    location: shop.location || null,
  };
}

function planLine(config, planKey, months) {
  const plan = findPlan(config, planKey) || findPlan(config, 'starter');
  return {
    plan,
    item: {
      description: `StockDesk ${plan?.name || 'plan'} plan`,
      detail: `${months} month${months > 1 ? 's' : ''} · ${plan?.staffLimit ? `owner + ${plan.staffLimit} staff` : 'unlimited staff'}`,
      quantity: months,
      unitPrice: plan?.price || 0,
    },
  };
}

// Invoice for an existing payment request.
async function invoiceForRequest(request, shop) {
  const config = await getBillingConfig();
  const { item } = planLine(config, request.plan, request.months);
  const pdf = await generateBillingPdf({
    type: 'invoice',
    number: `INV-${pad(request.id)}`,
    date: request.createdAt || new Date(),
    dueDate: request.dueDate || null,
    shop: await shopParty(shop),
    items: [item],
    amount: Number(request.amount),
    currency: config.currency,
    payTo: config.payTo,
  });
  return { pdf, filename: `StockDesk-invoice-INV-${pad(request.id)}.pdf` };
}

// Invoice for a shop's current plan (used by messages when there is no open
// request): the open request if there is one, else one month of its plan.
async function invoiceForShop(shop, { months = 1 } = {}) {
  const open = await PaymentRequest.findOne({ where: { shopId: shop.id, status: 'open' }, order: [['createdAt', 'DESC']] });
  if (open) return invoiceForRequest(open, shop);
  const config = await getBillingConfig();
  const { item } = planLine(config, shop.plan || 'starter', months);
  const today = new Date();
  const number = `INV-S${shop.id}-${today.toISOString().slice(0, 10).replace(/-/g, '')}`;
  const pdf = await generateBillingPdf({
    type: 'invoice',
    number,
    date: today,
    dueDate: shop.paidUntil && new Date(shop.paidUntil) > today ? shop.paidUntil : shop.trialEndsAt && new Date(shop.trialEndsAt) > today ? shop.trialEndsAt : today,
    shop: await shopParty(shop),
    items: [item],
    currency: config.currency,
    payTo: config.payTo,
  });
  return { pdf, filename: `StockDesk-invoice-${number}.pdf` };
}

// Receipt for a confirmed payment.
async function receiptForPayment(payment, shop) {
  const config = await getBillingConfig();
  const { item } = planLine(config, payment.plan, payment.months);
  const pdf = await generateBillingPdf({
    type: 'receipt',
    number: `PAY-${pad(payment.id)}`,
    date: payment.reviewedAt || payment.createdAt || new Date(),
    shop: await shopParty(shop),
    items: [item],
    amount: Number(payment.amount),
    currency: config.currency,
    payment: {
      method: payment.method,
      reference: payment.reference,
      paidOn: payment.createdAt,
      periodStart: payment.periodStart,
      periodEnd: payment.periodEnd,
    },
  });
  return { pdf, filename: `StockDesk-receipt-PAY-${pad(payment.id)}.pdf` };
}

async function latestReceiptForShop(shop) {
  const payment = await SubscriptionPayment.findOne({ where: { shopId: shop.id, status: 'confirmed' }, order: [['reviewedAt', 'DESC'], ['id', 'DESC']] });
  return payment ? receiptForPayment(payment, shop) : null;
}

async function loadShop(id) {
  return Shop.findByPk(id);
}

const asAttachment = (doc) => (doc ? [{ filename: doc.filename, content: doc.pdf, contentType: 'application/pdf' }] : undefined);

module.exports = { invoiceForRequest, invoiceForShop, receiptForPayment, latestReceiptForShop, loadShop, asAttachment };
