// Emails the platform owner sends to shop owners from the console: templates,
// audiences, preview, background sending and history.

const { Op } = require('sequelize');
const { Shop, User, PlatformMessage } = require('../models');
const { getBillingConfig, computeStatus, findPlan } = require('../utils/subscription');
const { renderEmail, sendPlatformEmail } = require('../services/emailService');
const docs = require('../services/billingDocs');

const TEMPLATES = [
  {
    key: 'welcome',
    label: 'Welcome',
    subject: 'Welcome to StockDesk, {shop}',
    body: "Thank you for choosing StockDesk for {shop}. We're glad to have you.\n\nTo get started, add your products (or import them from Excel), add your staff, and ring up your first sale. Your free trial runs until {endDate}.\n\nIf you need any help setting up, reply to this email or message us on WhatsApp on +256 742 226 839.",
    cta: { label: 'Open StockDesk', path: '/app' },
  },
  {
    key: 'trial_ending',
    label: 'Trial ending',
    subject: 'Your free trial ends on {endDate}',
    body: "Your free month of StockDesk for {shop} ends on {endDate} ({daysLeft} days left).\n\nTo keep selling without a break, choose a plan and pay with MTN Mobile Money or Airtel Money from the Billing page. Paying early doesn't cost you any trial days.\n\nThank you for using StockDesk.",
    cta: { label: 'Choose a plan', path: '/app/billing' },
    attach: 'invoice',
  },
  {
    key: 'payment_reminder',
    label: 'Payment reminder',
    subject: 'Payment reminder for {shop}',
    body: "This is a friendly reminder that the StockDesk payment for {shop} is due ({plan} plan, {amount}).\n\nYou can pay by Mobile Money from the Billing page in StockDesk. If you have already paid, thank you, and please ignore this message.",
    cta: { label: 'Pay now', path: '/app/billing' },
    attach: 'invoice',
  },
  {
    key: 'thank_you',
    label: 'Thank you',
    subject: 'Thank you, {name}',
    body: 'Thank you for your payment and for trusting StockDesk to run {shop}. We truly appreciate your business.\n\nIf there is anything we can do better, just reply to this email. We read every message.',
    cta: null,
    attach: 'receipt',
  },
  {
    key: 'announcement',
    label: 'Announcement',
    subject: "What's new in StockDesk",
    body: "We have added new features to StockDesk to help {shop} sell more and save time:\n\n- Wholesale, loyalty and special prices per customer\n- Receipts by email with the PDF attached\n- Automatic payment reminders for customers who owe you\n\nOpen StockDesk to try them out.",
    cta: { label: 'Open StockDesk', path: '/app' },
  },
  {
    key: 'custom',
    label: 'Custom message',
    subject: '',
    body: '',
    cta: null,
  },
];

const AUDIENCES = {
  all: 'All shops',
  trial: 'On free trial',
  trial_ending: 'Trial ending within 7 days',
  active: 'Paying',
  past_due: 'Payment due',
  expired: 'Read-only',
  custom: 'Chosen shops',
};

const money = (n, currency = 'UGX') => `${currency} ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const frontendUrl = () => (process.env.FRONTEND_URL || 'https://app.stockdeskinventory.com').replace(/\/$/, '');

// Every shop with its owner, status and the values placeholders use.
async function loadRecipients() {
  const config = await getBillingConfig();
  const shops = await Shop.findAll({ attributes: ['id', 'name', 'plan', 'trialEndsAt', 'paidUntil', 'isActive'], order: [['name', 'ASC']] });
  const owners = await User.findAll({
    where: { role: 'Admin', shopId: { [Op.in]: shops.map((s) => s.id) } },
    attributes: ['shopId', 'name', 'username', 'email'],
    order: [['createdAt', 'ASC']],
  });
  const ownerByShop = new Map();
  owners.forEach((o) => { if (!ownerByShop.has(o.shopId)) ownerByShop.set(o.shopId, o); });
  return shops.map((shop) => {
    const st = computeStatus(shop, config);
    const owner = ownerByShop.get(shop.id);
    const plan = findPlan(config, shop.plan || 'starter');
    return {
      shopId: shop.id,
      shopName: shop.name,
      email: owner?.email || null,
      state: st.state,
      daysLeft: st.daysLeft,
      values: {
        name: owner?.name || owner?.username || 'there',
        shop: shop.name,
        plan: plan?.name || 'Starter',
        amount: money(plan?.price || 0, config.currency),
        daysLeft: st.daysLeft != null ? String(Math.max(0, st.daysLeft)) : '',
        endDate: fmtDate(st.endsAt),
      },
    };
  });
}

function pickAudience(all, audience, shopIds) {
  switch (audience) {
    case 'trial': return all.filter((r) => r.state === 'trial');
    case 'trial_ending': return all.filter((r) => r.state === 'trial' && r.daysLeft != null && r.daysLeft <= 7);
    case 'active': return all.filter((r) => r.state === 'active');
    case 'past_due': return all.filter((r) => r.state === 'past_due');
    case 'expired': return all.filter((r) => r.state === 'expired');
    case 'custom': {
      const ids = new Set((shopIds || []).map(Number));
      return all.filter((r) => ids.has(r.shopId));
    }
    default: return all;
  }
}

const fill = (text, values) => String(text || '').replace(/\{(name|shop|plan|amount|daysLeft|endDate)\}/g, (_, k) => values[k] ?? '');

function buildEmail({ subject, body, ctaLabel, ctaPath }, values) {
  const filledSubject = fill(subject, values).trim();
  const paragraphs = fill(body, values).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const content = {
    preheader: paragraphs[0] ? paragraphs[0].slice(0, 140) : filledSubject,
    heading: filledSubject,
    greeting: `Hello ${values.name},`,
    paragraphs,
    cta: ctaLabel && ctaPath ? { label: ctaLabel, url: `${frontendUrl()}${ctaPath}` } : null,
    note: 'You are receiving this because you have a StockDesk account. Reply to this email if you have any questions.',
  };
  return { subject: filledSubject, content };
}

function validate(body) {
  const subject = String(body.subject || '').trim();
  const text = String(body.body || '').trim();
  if (!subject || subject.length > 200) return 'Enter a subject (up to 200 characters).';
  if (!text || text.length > 5000) return 'Write a message (up to 5000 characters).';
  if (!AUDIENCES[body.audience]) return 'Choose who should receive the email.';
  if (body.audience === 'custom' && !(Array.isArray(body.shopIds) && body.shopIds.length)) return 'Choose at least one shop.';
  if (body.attach && !['none', 'invoice', 'receipt'].includes(body.attach)) return 'Choose what to attach.';
  return null;
}

exports.overview = async (req, res, next) => {
  try {
    const [recipients, history] = await Promise.all([
      loadRecipients(),
      PlatformMessage.findAll({ order: [['createdAt', 'DESC']], limit: 30, attributes: { exclude: ['recipients'] } }),
    ]);
    const counts = Object.fromEntries(Object.keys(AUDIENCES).map((key) => {
      const list = key === 'custom' ? [] : pickAudience(recipients, key);
      return [key, { total: list.length, withEmail: list.filter((r) => r.email).length }];
    }));
    res.json({
      templates: TEMPLATES,
      audiences: Object.entries(AUDIENCES).map(([key, label]) => ({ key, label, ...counts[key] })),
      shops: recipients.map(({ shopId, shopName, email, state, daysLeft }) => ({ shopId, shopName, hasEmail: Boolean(email), state, daysLeft })),
      history,
    });
  } catch (error) {
    next(error);
  }
};

exports.preview = async (req, res, next) => {
  try {
    const problem = validate(req.body);
    if (problem) return res.status(400).json({ message: problem });
    const list = pickAudience(await loadRecipients(), req.body.audience, req.body.shopIds);
    const withEmail = list.filter((r) => r.email);
    const sample = withEmail[0] || list[0] || { values: { name: 'Kato', shop: 'Kato General Store', plan: 'Starter', amount: 'UGX 15,000', daysLeft: '5', endDate: fmtDate(new Date()) } };
    const { subject, content } = buildEmail(req.body, sample.values);
    const { html } = renderEmail(content);
    res.json({ subject, html, total: list.length, withEmail: withEmail.length, sampleShop: sample.shopName || null });
  } catch (error) {
    next(error);
  }
};

exports.send = async (req, res, next) => {
  try {
    const problem = validate(req.body);
    if (problem) return res.status(400).json({ message: problem });
    const list = pickAudience(await loadRecipients(), req.body.audience, req.body.shopIds).filter((r) => r.email);
    if (!list.length) return res.status(400).json({ message: 'None of the chosen shops has an owner email address.' });

    const message = await PlatformMessage.create({
      subject: String(req.body.subject).trim(),
      body: String(req.body.body).trim(),
      audience: req.body.audience,
      template: req.body.template || null,
      recipientCount: list.length,
      status: 'sending',
      recipients: list.map((r) => ({ shopId: r.shopId, shopName: r.shopName, email: r.email, status: 'queued' })),
      createdByUserId: req.user.id,
    });
    res.status(202).json({ id: message.id, recipientCount: list.length });

    // Send in the background at a gentle pace (email providers rate-limit).
    const input = { subject: req.body.subject, body: req.body.body, ctaLabel: req.body.ctaLabel, ctaPath: req.body.ctaPath };
    const attach = req.body.attach || 'none';
    setImmediate(async () => {
      const results = [];
      let sent = 0;
      let failed = 0;
      for (const r of list) {
        const { subject, content } = buildEmail(input, r.values);
        try {
          // Each shop gets its own invoice or its latest payment receipt.
          let attachment = null;
          let note = null;
          if (attach !== 'none') {
            const shop = await docs.loadShop(r.shopId);
            const doc = attach === 'invoice' ? await docs.invoiceForShop(shop) : await docs.latestReceiptForShop(shop);
            if (doc) attachment = docs.asAttachment(doc);
            else note = 'no confirmed payment, so no receipt attached';
          }
          await sendPlatformEmail(r.email, { subject, ...content, attachments: attachment || undefined });
          sent += 1;
          results.push({ shopId: r.shopId, shopName: r.shopName, email: r.email, status: 'sent', ...(note ? { error: note } : {}), ...(attachment ? { attachment: attachment[0].filename } : {}) });
        } catch (error) {
          failed += 1;
          results.push({ shopId: r.shopId, shopName: r.shopName, email: r.email, status: 'failed', error: String(error.message).slice(0, 200) });
        }
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      try {
        await message.update({ sentCount: sent, failedCount: failed, status: failed && !sent ? 'failed' : 'sent', recipients: results });
      } catch (error) {
        console.error('[messages] could not save results:', error.message);
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.detail = async (req, res, next) => {
  try {
    const message = await PlatformMessage.findByPk(req.params.id);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    res.json(message);
  } catch (error) {
    next(error);
  }
};

exports.TEMPLATES = TEMPLATES;
