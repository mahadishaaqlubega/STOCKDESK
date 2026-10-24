// Emails a shop sends to its customers and its owner: receipts (on request or
// automatically after a sale), thank-yous for payments, payment reminders and
// the owner's end-of-day summary. Automatic ones only go out when the shop
// has switched them on in Settings, and never block a sale or a payment.

const { PassThrough } = require('stream');
const { Op, QueryTypes } = require('sequelize');
const {
  Sale, SaleItem, Product, Receipt, User, Setting, Shop, Customer, sequelize,
} = require('../models');
const { generateReceiptPdf } = require('../utils/receiptGenerator');
const { generateBillingPdf } = require('../utils/billingPdf');
const { startOfDay, endOfDay, getMetricsForRange } = require('../utils/businessMetrics');
const { sendReceiptEmail, sendShopEmail, escapeHtml } = require('./emailService');

const TZ = process.env.APP_TIMEZONE || 'Africa/Kampala';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DAY = 86400000;

const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
const fmtDateTime = (d) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ });
const localHour = (d = new Date()) => Number(new Date(d).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ }));
const localDate = (d = new Date()) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
const isEmail = (v) => EMAIL_RE.test(String(v || '').trim());

function receiptNumberFor(sale) {
  return sale.receipt?.receiptNumber || `SD-${String(sale.id).padStart(6, '0')}`;
}

function shopInfo(settings) {
  return {
    name: settings?.shop?.name || settings?.shopName || 'StockDesk',
    phone: settings?.phone || '',
    address: settings?.address || '',
  };
}

async function ownerEmail(shopId) {
  const owner = await User.findOne({
    where: { shopId, role: 'Admin', email: { [Op.ne]: null } },
    attributes: ['email', 'name'],
    order: [['createdAt', 'ASC']],
  });
  return owner || null;
}

async function shopSettings(shopId) {
  return Setting.findOne({ where: { shopId }, include: [{ model: Shop, as: 'shop', attributes: ['id', 'name', 'slug', 'isActive'] }] });
}

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
    shopSettings(shopId),
  ]);
  return { sale, settings };
}

// The A4 receipt PDF as a Buffer (for email attachments).
async function receiptPdfBuffer(sale, settings) {
  const stream = new PassThrough();
  const chunks = [];
  stream.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  await generateReceiptPdf(stream, sale, settings || {});
  await done;
  return Buffer.concat(chunks);
}

// Receipt email with the PDF attached. Throws if sending fails.
async function sendSaleReceipt(saleId, shopId, to, { message } = {}) {
  const { sale, settings } = await loadReceiptData(saleId, shopId);
  if (!sale) throw Object.assign(new Error('Sale not found'), { status: 404 });
  const currency = sale.currency || settings?.currency || 'UGX';
  const money = (n) => `${currency} ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const items = (sale.items || []).map((it) => ({ name: it.Product?.name || 'Item', quantity: Number(it.quantity || 0), price: Number(it.price || 0) }));
  const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const discount = Number(sale.discount || 0);
  const tax = Number(sale.taxAmount || 0);
  const totals = [
    ...(discount > 0 || tax > 0 ? [['Subtotal', money(subtotal)]] : []),
    ...(discount > 0 ? [['Discount', `-${money(discount)}`]] : []),
    ...(tax > 0 ? [[`VAT ${Number(sale.tax || 0)}%`, money(tax)]] : []),
    ['Total', money(sale.total), true],
  ];
  const owner = await ownerEmail(shopId);
  const shop = shopInfo(settings);
  const pdf = await receiptPdfBuffer(sale, settings);
  await sendReceiptEmail(to, {
    shopName: shop.name,
    shopPhone: shop.phone,
    shopAddress: shop.address,
    replyTo: owner?.email || undefined,
    receiptNumber: receiptNumberFor(sale),
    date: fmtDateTime(sale.createdAt),
    cashier: sale.cashier?.name || '-',
    customerName: sale.customer && sale.customer.name !== 'Walk-in Customer' ? sale.customer.name : null,
    items,
    totals,
    paymentMethod: sale.paymentMethod,
    balanceDue: Number(sale.balanceDue || 0),
    currency,
    pdf,
    message,
  });
  return { sale };
}

// After a sale: email the receipt if the shop has it switched on and the
// customer has an email address. Never throws.
async function autoReceiptAfterSale(saleId, shopId) {
  try {
    const settings = await Setting.findOne({ where: { shopId }, attributes: ['autoEmailReceipts'] });
    if (!settings?.autoEmailReceipts) return false;
    const sale = await Sale.findOne({ where: { id: saleId, shopId }, include: [{ model: Customer, as: 'customer', attributes: ['email', 'name'] }] });
    const to = sale?.customer?.email;
    if (!isEmail(to)) return false;
    await sendSaleReceipt(saleId, shopId, to, { message: 'Thank you for your purchase! Here is your receipt. A PDF copy is attached for your records.' });
    return true;
  } catch (error) {
    console.error(`[auto email] receipt for sale ${saleId} failed:`, error.message);
    return false;
  }
}

// After a customer pays toward what they owe. Never throws.
async function autoPaymentThanks({ shopId, customerId, amount, method }) {
  try {
    const settings = await shopSettings(shopId);
    if (!settings?.autoEmailPaymentThanks) return false;
    const customer = await Customer.findOne({ where: { id: customerId, shopId }, attributes: ['id', 'name', 'email'] });
    if (!isEmail(customer?.email)) return false;
    const balance = Number((await Sale.sum('balanceDue', { where: { shopId, customerId } })) || 0);
    const currency = settings.currency || 'UGX';
    const money = (n) => `${currency} ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    const shop = shopInfo(settings);
    const owner = await ownerEmail(shopId);
    await sendShopEmail(customer.email, {
      shop,
      replyTo: owner?.email,
      subject: `Payment received, thank you (${shop.name})`,
      preheader: `We received ${money(amount)}. ${balance > 0 ? `Remaining balance: ${money(balance)}.` : 'Your account is fully paid.'}`,
      eyebrow: 'Payment received',
      heading: 'Thank you for your payment',
      greeting: `Hello ${customer.name},`,
      paragraphs: [
        `We have received your payment of ${money(amount)}. Thank you for paying on time.`,
        balance > 0 ? `Your remaining balance with ${shop.name} is ${money(balance)}.` : `Your account with ${shop.name} is now fully paid. Thank you!`,
      ],
      details: [
        ['Amount paid', money(amount), { strong: true }],
        ['Paid by', method],
        ['Date', fmtDateTime(new Date())],
        ['Balance remaining', money(balance), { strong: true, color: balance > 0 ? '#b45309' : '#15803d' }],
      ],
      note: 'Keep this email as proof of payment. Reply if anything looks wrong.',
    });
    return true;
  } catch (error) {
    console.error('[auto email] payment thank-you failed:', error.message);
    return false;
  }
}

// A customer's statement: every sale with a balance still owed, as a PDF.
async function customerStatementPdf(shopId, customerId) {
  const [settings, customer] = await Promise.all([
    shopSettings(shopId),
    Customer.findOne({ where: { id: customerId, shopId }, attributes: ['id', 'name', 'phone', 'email', 'address'] }),
  ]);
  if (!customer) return null;
  const open = await Sale.findAll({
    where: { shopId, customerId, balanceDue: { [Op.gt]: 0 } },
    include: [{ model: Receipt, as: 'receipt', attributes: ['receiptNumber'] }],
    attributes: ['id', 'createdAt', 'total', 'balanceDue', 'dueDate'],
    order: [['createdAt', 'ASC']],
  });
  const shop = shopInfo(settings);
  const currency = settings?.currency || 'UGX';
  const dueOf = (s) => (s.dueDate ? new Date(`${s.dueDate}T23:59:59`) : new Date(new Date(s.createdAt).getTime() + 30 * DAY));
  const pdf = await generateBillingPdf({
    type: 'statement',
    number: `ST-${customer.id}-${localDate().replace(/-/g, '')}`,
    date: new Date(),
    seller: { name: shop.name, lines: [shop.address, shop.phone] },
    shop: { name: customer.name, phone: customer.phone, email: customer.email, location: customer.address },
    items: open.map((s) => ({
      description: `Sale ${receiptNumberFor(s)}`,
      detail: `${fmtDate(s.createdAt)} · due ${fmtDate(dueOf(s))} · sale total ${currency} ${Number(s.total).toLocaleString('en-US')}${dueOf(s) < new Date() ? ' · OVERDUE' : ''}`,
      quantity: 1,
      unitPrice: Number(s.balanceDue),
    })),
    summary: `As of ${fmtDate(new Date())}`,
    currency,
    panelLines: [
      `Please pay at ${shop.name}${shop.phone ? ` or call ${shop.phone}` : ''}.`,
      'If you have already paid, thank you, and please ignore this statement.',
    ],
  });
  return { pdf, filename: `Statement-${customer.name.replace(/[^\w]+/g, '-')}-${localDate()}.pdf`, count: open.length };
}

// ── Scheduled emails ──────────────────────────────────────────────────────────

// Payment reminders: for each customer who owes money and has an email, send
// one when the earliest due date is within `reminderDaysBefore` days, then
// every `reminderRepeatDays` while anything stays unpaid. Credit sales with no
// due date count as due 30 days after the sale. Daytime only (8:00-19:00).
async function runPaymentReminders(now = new Date()) {
  const hour = localHour(now);
  if (hour < 8 || hour >= 19) return 0;
  let sent = 0;
  const shops = await Setting.findAll({
    where: { autoEmailReminders: true },
    include: [{ model: Shop, as: 'shop', attributes: ['id', 'name', 'isActive'] }],
  });
  for (const settings of shops) {
    if (!settings.shop || settings.shop.isActive === false) continue;
    const shopId = settings.shopId;
    const currency = settings.currency || 'UGX';
    const money = (n) => `${currency} ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    const shop = shopInfo(settings);
    const owner = await ownerEmail(shopId);
    const customers = await Customer.findAll({
      where: { shopId, email: { [Op.ne]: null } },
      attributes: ['id', 'name', 'email', 'lastEmailReminderAt'],
    });
    for (const customer of customers) {
      if (!isEmail(customer.email)) continue;
      const open = await Sale.findAll({
        where: { shopId, customerId: customer.id, balanceDue: { [Op.gt]: 0 } },
        include: [{ model: Receipt, as: 'receipt', attributes: ['receiptNumber'] }],
        attributes: ['id', 'createdAt', 'balanceDue', 'dueDate'],
        order: [['createdAt', 'ASC']],
      });
      if (!open.length) continue;
      const dueOf = (s) => (s.dueDate ? new Date(`${s.dueDate}T23:59:59`) : new Date(new Date(s.createdAt).getTime() + 30 * DAY));
      const earliest = open.map(dueOf).sort((a, b) => a - b)[0];
      const daysToDue = Math.ceil((earliest - now) / DAY);
      if (daysToDue > settings.reminderDaysBefore) continue;
      const last = customer.lastEmailReminderAt ? new Date(customer.lastEmailReminderAt) : null;
      if (last && now - last < settings.reminderRepeatDays * DAY - 3600000) continue;

      const total = open.reduce((sum, s) => sum + Number(s.balanceDue), 0);
      const overdue = daysToDue < 0;
      const rows = open.map((s) => {
        const due = dueOf(s);
        const late = due < now;
        return `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;">${escapeHtml(receiptNumberFor(s))}<br><span style="font-size:12px;color:#64748b;">${escapeHtml(fmtDate(s.createdAt))} · due ${escapeHtml(fmtDate(due))}${late ? ' · <b style="color:#b91c1c;">overdue</b>' : ''}</span></td>
          <td align="right" style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:600;color:#1e293b;white-space:nowrap;">${escapeHtml(money(s.balanceDue))}</td>
        </tr>`;
      }).join('');
      try {
        const statement = await customerStatementPdf(shopId, customer.id).catch(() => null);
        await sendShopEmail(customer.email, {
          shop,
          replyTo: owner?.email,
          attachments: statement ? [{ filename: statement.filename, content: statement.pdf, contentType: 'application/pdf' }] : undefined,
          subject: overdue ? `Payment overdue: ${money(total)} (${shop.name})` : `Friendly reminder: ${money(total)} due ${daysToDue <= 0 ? 'today' : `in ${daysToDue} day${daysToDue === 1 ? '' : 's'}`}`,
          preheader: `You have ${money(total)} outstanding with ${shop.name}.`,
          eyebrow: overdue ? 'Payment overdue' : 'Payment reminder',
          heading: overdue ? 'Your payment is overdue' : 'A friendly payment reminder',
          greeting: `Hello ${customer.name},`,
          paragraphs: [
            overdue
              ? `This is a reminder that ${money(total)} on your account with ${shop.name} is now overdue. Please pay at your earliest convenience.`
              : `This is a friendly reminder that ${money(total)} on your account with ${shop.name} is due ${daysToDue <= 0 ? 'today' : `on ${fmtDate(earliest)}`}.`,
            `You can pay at the shop${shop.phone ? ` or call us on ${shop.phone}` : ''}. If you have already paid, thank you, and please ignore this email.`,
          ],
          details: [['Total outstanding', money(total), { strong: true, color: overdue ? '#b91c1c' : '#b45309' }]],
          extraHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 6px;">${rows}</table>`,
          extraText: open.map((s) => `${receiptNumberFor(s)}: ${money(s.balanceDue)} (due ${fmtDate(dueOf(s))})`).join('\n'),
          note: 'Questions about your balance? Reply to this email and the shop will get back to you.',
        });
        customer.lastEmailReminderAt = now;
        await customer.save({ fields: ['lastEmailReminderAt'] });
        sent += 1;
      } catch (error) {
        console.error(`[auto email] reminder to customer ${customer.id} failed:`, error.message);
      }
    }
  }
  if (sent) console.log(`[auto email] sent ${sent} payment reminder(s)`);
  return sent;
}

// End-of-day summary for shop owners who switched it on, once a day from 20:00.
async function runDailySummaries(now = new Date()) {
  if (localHour(now) < 20) return 0;
  const today = localDate(now);
  let sent = 0;
  const shops = await Setting.findAll({
    where: { ownerDailySummary: true, [Op.or]: [{ lastDailySummaryDate: null }, { lastDailySummaryDate: { [Op.ne]: today } }] },
    include: [{ model: Shop, as: 'shop', attributes: ['id', 'name', 'isActive'] }],
  });
  for (const settings of shops) {
    if (!settings.shop || settings.shop.isActive === false) continue;
    const shopId = settings.shopId;
    const owner = await ownerEmail(shopId);
    if (!owner?.email) continue;
    try {
      const currency = settings.currency || 'UGX';
      const money = (n) => `${currency} ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
      const m = await getMetricsForRange(shopId, startOfDay(now), endOfDay(now));
      const top = await sequelize.query(
        `SELECT p.name, SUM(si.quantity) AS units, SUM(si.price * si.quantity) AS revenue
           FROM sale_items si JOIN sales s ON s.id = si."saleId" JOIN products p ON p.id = si."productId"
          WHERE s."shopId" = :shopId AND s."createdAt" >= :start AND s."createdAt" <= :end
          GROUP BY p.name ORDER BY units DESC LIMIT 5`,
        { replacements: { shopId, start: startOfDay(now), end: endOfDay(now) }, type: QueryTypes.SELECT }
      );
      const lowStock = await Product.count({ where: { shopId, isActive: true, type: 'goods', quantity: { [Op.lte]: sequelize.col('lowStock') } } });
      const owed = Number((await Sale.sum('balanceDue', { where: { shopId } })) || 0);
      const shop = shopInfo(settings);
      const topRows = top.map((t) => `<tr>
          <td style="padding:7px 0;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;">${escapeHtml(t.name)}</td>
          <td align="right" style="padding:7px 0;border-bottom:1px solid #e2e8f0;font-size:14px;color:#64748b;">${Number(t.units)} sold</td>
          <td align="right" style="padding:7px 0 7px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:600;color:#1e293b;white-space:nowrap;">${escapeHtml(money(t.revenue))}</td>
        </tr>`).join('');
      await sendShopEmail(owner.email, {
        shop,
        subject: `${shop.name}: ${money(m.netSales)} in sales today`,
        preheader: `${m.orderCount} sales, ${money(m.grossProfit)} profit, ${lowStock} item${lowStock === 1 ? '' : 's'} low on stock.`,
        eyebrow: `Daily summary · ${fmtDate(now)}`,
        heading: `Here's how ${shop.name} did today`,
        greeting: `Hello ${owner.name || 'there'},`,
        details: [
          ['Sales today', money(m.netSales), { strong: true }],
          ['Number of sales', String(m.orderCount || 0)],
          ['Items sold', String(m.itemsSold || 0)],
          ['Gross profit', money(m.grossProfit), { strong: true, color: '#15803d' }],
          ['Items low on stock', String(lowStock), lowStock ? { color: '#b45309', strong: true } : {}],
          ['Customers owe you', money(owed), owed ? { color: '#b45309' } : {}],
        ],
        extraHtml: top.length ? `<p style="margin:6px 0 4px;font-size:13px;font-weight:700;color:#0b1220;">Top sellers today</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${topRows}</table>` : '',
        extraText: top.map((t) => `${t.name}: ${Number(t.units)} sold, ${money(t.revenue)}`).join('\n'),
        cta: { label: 'Open StockDesk', url: `${(process.env.FRONTEND_URL || 'https://app.stockdeskinventory.com').replace(/\/$/, '')}/app` },
        note: 'You get this summary because it is switched on in Settings > Automatic emails.',
      });
      settings.lastDailySummaryDate = today;
      await settings.save({ fields: ['lastDailySummaryDate'] });
      sent += 1;
    } catch (error) {
      console.error(`[auto email] daily summary for shop ${shopId} failed:`, error.message);
    }
  }
  if (sent) console.log(`[auto email] sent ${sent} daily summar${sent === 1 ? 'y' : 'ies'}`);
  return sent;
}

let running = false;
async function runScheduledCustomerEmails(now = new Date()) {
  if (running) return;
  running = true;
  try {
    await runPaymentReminders(now);
    await runDailySummaries(now);
  } catch (error) {
    console.error('[auto email] scheduled run failed:', error.message);
  } finally {
    running = false;
  }
}

function startCustomerEmailScheduler() {
  if (process.env.NODE_ENV === 'test' || process.env.CUSTOMER_EMAILS === 'off') return;
  setTimeout(runScheduledCustomerEmails, 3 * 60 * 1000);
  setInterval(runScheduledCustomerEmails, 30 * 60 * 1000);
  console.log('[auto email] scheduler started (every 30 minutes)');
}

module.exports = {
  loadReceiptData,
  receiptPdfBuffer,
  sendSaleReceipt,
  autoReceiptAfterSale,
  autoPaymentThanks,
  runPaymentReminders,
  runDailySummaries,
  runScheduledCustomerEmails,
  startCustomerEmailScheduler,
  customerStatementPdf,
  isEmail,
};
