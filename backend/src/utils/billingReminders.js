// Emails shop owners before their trial or paid period ends, when payment is
// due, and when the shop turns read-only. Each notice is sent once: the key of
// the last one is stored on the shop.

const { Op } = require('sequelize');
const { Shop, User } = require('../models');
const { getBillingConfig, computeStatus, findPlan } = require('./subscription');
const { sendBillingEmail } = require('../services/emailService');

const INTERVAL_MS = 60 * 60 * 1000;
const BUCKETS = [1, 3, 7];
let running = false;

const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

function noticeFor(shop, status, config) {
  const day = status.endsAt ? new Date(status.endsAt).toISOString().slice(0, 10) : 'none';
  const plan = findPlan(config, shop.plan || 'starter');
  const price = plan ? `${config.currency} ${plan.price.toLocaleString('en-US')} a month for ${plan.name}` : '';

  if ((status.state === 'trial' || status.state === 'active') && status.daysLeft != null && status.daysLeft > 0) {
    const bucket = BUCKETS.find((b) => status.daysLeft <= b);
    if (!bucket) return null;
    const trial = status.state === 'trial';
    const when = status.daysLeft === 1 ? 'tomorrow' : `in ${status.daysLeft} days`;
    return {
      key: `${trial ? 'trial' : 'paid'}-${bucket}:${day}`,
      subject: trial ? `Your StockDesk free trial ends ${when}` : `Your StockDesk plan renews ${when}`,
      heading: trial ? `Your free trial ends ${when}` : `Time to renew ${shop.name}`,
      lines: [
        trial
          ? `Your free month of StockDesk for ${shop.name} ends on ${fmtDate(status.endsAt)}.`
          : `${shop.name} is paid up until ${fmtDate(status.endsAt)}.`,
        `To keep selling without a break, choose a plan and pay with MTN Mobile Money or Airtel Money${price ? ` (${price})` : ''}.`,
        'Open Billing in StockDesk, send the payment, and enter the transaction ID. We confirm within a few hours.',
      ],
    };
  }
  if (status.state === 'past_due') {
    return {
      key: `due:${day}`,
      subject: `Payment due for ${shop.name}`,
      heading: 'Your StockDesk payment is due',
      lines: [
        `Your ${shop.paidUntil ? 'plan' : 'free trial'} ended on ${fmtDate(status.endsAt)}. Everything still works for now.`,
        `If we don't receive payment by ${fmtDate(status.graceEndsAt)}, the shop becomes read-only: you can still see and export your records, but not make new sales.`,
        'Open Billing in StockDesk to pay with Mobile Money.',
      ],
      ctaLabel: 'Pay now',
    };
  }
  if (status.state === 'expired') {
    return {
      key: `expired:${day}`,
      subject: `${shop.name} is now read-only`,
      heading: 'Your shop is read-only until you renew',
      lines: [
        `We didn't receive payment for ${shop.name}, so it is now read-only. Your products, sales and customers are safe and nothing has been deleted.`,
        'Pay with Mobile Money from the Billing page and selling starts again as soon as we confirm it.',
      ],
      ctaLabel: 'Renew now',
    };
  }
  return null;
}

async function runBillingReminders(now = new Date()) {
  if (running) return 0;
  running = true;
  let sent = 0;
  try {
    const config = await getBillingConfig({ fresh: true });
    const shops = await Shop.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'plan', 'trialEndsAt', 'paidUntil', 'lastBillingNotice'],
    });
    for (const shop of shops) {
      const notice = noticeFor(shop, computeStatus(shop, config, now), config);
      if (!notice || notice.key === shop.lastBillingNotice) continue;
      const owner = await User.findOne({
        where: { shopId: shop.id, role: 'Admin', email: { [Op.ne]: null } },
        attributes: ['email'],
        order: [['createdAt', 'ASC']],
      });
      if (!owner?.email) continue;
      try {
        await sendBillingEmail(owner.email, notice);
        shop.lastBillingNotice = notice.key;
        await shop.save({ fields: ['lastBillingNotice'] });
        sent += 1;
      } catch (error) {
        console.error(`[billing] reminder for shop ${shop.id} failed:`, error.message);
      }
    }
    if (sent) console.log(`[billing] sent ${sent} reminder email(s)`);
  } catch (error) {
    console.error('[billing] reminder run failed:', error.message);
  } finally {
    running = false;
  }
  return sent;
}

function startBillingReminders() {
  if (process.env.NODE_ENV === 'test' || process.env.BILLING_REMINDERS === 'off') return;
  setTimeout(runBillingReminders, 2 * 60 * 1000);
  setInterval(runBillingReminders, INTERVAL_MS);
  console.log('[billing] reminder scheduler started (hourly)');
}

module.exports = { startBillingReminders, runBillingReminders, noticeFor };
