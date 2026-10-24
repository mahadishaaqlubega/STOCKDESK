const nodemailer = require('nodemailer');
const { Resend } = require('resend');

// Ensure `fetch` is available (Node 18+). Fallback to `node-fetch` when running on older Node.
let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    // node-fetch v3 is ESM; when required from CommonJS it may be the default export.
    // Guard with (module.default || module) to handle both shapes.
    // eslint-disable-next-line global-require
    const nodeFetch = require('node-fetch');
    fetchFn = nodeFetch.default || nodeFetch;
  } catch (err) {
    // leave fetchFn undefined; we'll surface a helpful error if it's needed at runtime
    fetchFn = undefined;
  }
}

// ── Provider selection ────────────────────────────────────────────────────────

function getProvider() {
  const configured = String(process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  if (configured) {
    if (['resend', 'smtp'].includes(configured)) {
      return configured;
    }
    throw new Error(`Unsupported EMAIL_PROVIDER "${configured}". Use "resend" or "smtp".`);
  }

  if (process.env.RESEND_API_KEY) {
    return 'resend';
  }
  const hasSmtp = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM_EMAIL;
  if (hasSmtp) {
    return 'smtp';
  }
  throw new Error('No email provider is configured. Set RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASSWORD/SMTP_FROM_EMAIL.');
}

// ── URL helpers ───────────────────────────────────────────────────────────────

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function getBrandLogoUrl() {
  const custom = (process.env.BRAND_LOGO_URL || '').trim();
  if (custom) return custom;
  return `${getFrontendUrl()}/logo.png`;
}

function buildVerificationUrl(token) {
  return `${getFrontendUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

function buildResetUrl(token) {
  return `${getFrontendUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

// ── SMTP transport ────────────────────────────────────────────────────────────

function createSmtpTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    throw new Error('SMTP is not fully configured. Please set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD.');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user,
      pass,
    },
  });
}

function getFromName() {
  return process.env.RESEND_FROM_NAME || process.env.SMTP_FROM_NAME || 'StockDesk';
}

function getFromEmail(provider) {
  return (
    process.env.RESEND_FROM_EMAIL ||
    process.env.EMAIL_FROM ||
    process.env.SMTP_FROM_EMAIL ||
    (provider === 'resend' ? 'onboarding@resend.dev' : '')
  );
}

async function sendViaSmtp({ to, subject, html, text, fromName: nameOverride, replyTo, attachments }) {
  const fromName = (nameOverride || getFromName()).replace(/["<>]/g, '');
  const fromEmail = getFromEmail('smtp');

  if (!fromEmail) {
    throw new Error('SMTP_FROM_EMAIL is required for SMTP email delivery.');
  }

  const transporter = createSmtpTransporter();
  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
    ...(text ? { text } : {}),
    ...(replyTo ? { replyTo } : {}),
    ...(attachments ? { attachments } : {}),
  });
}

// ── Resend API transport ───────────────────────────────────────────────────────

async function sendViaResend({ to, subject, html, text, fromName: nameOverride, replyTo, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromName = (nameOverride || getFromName()).replace(/["<>]/g, '');
  const fromEmail = getFromEmail('resend');

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is required for Resend email delivery.');
  }
  if (!fromEmail) {
    throw new Error('RESEND_FROM_EMAIL, EMAIL_FROM, or SMTP_FROM_EMAIL is required for Resend email delivery.');
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    html,
    ...(text ? { text } : {}),
    ...(replyTo ? { replyTo } : {}),
    ...(attachments ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })) } : {}),
  }) || {};
  if (error) throw new Error(error.message || 'Resend rejected the email');
}

async function sendEmail(payload) {
  const provider = getProvider();
  console.log(`[emailService] Sending via ${provider} to ${payload.to}`);
  if (provider === 'resend') {
    await sendViaResend(payload);
  } else if (provider === 'smtp') {
    await sendViaSmtp(payload);
  } else {
    throw new Error(`Unsupported email provider: ${provider}`);
  }
}

// ── Template ──────────────────────────────────────────────────────────────────
//
// One layout for every email: table-based with inline styles so it renders
// the same in Gmail, Outlook and phone mail apps.

const BRAND = {
  name: 'StockDesk',
  teal: '#0d9488',
  tealDark: '#0f766e',
  ink: '#0b1220',
  text: '#1e293b',
  muted: '#64748b',
  line: '#e2e8f0',
  soft: '#f1f5f9',
  site: 'https://www.stockdeskinventory.com',
  supportEmail: process.env.SUPPORT_EMAIL || 'hello@stockdeskinventory.com',
  supportWhatsapp: process.env.SUPPORT_WHATSAPP || '+256 742 226 839',
};

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// rows: [[label, value, { strong, color }]] shown as a two-column summary box.
function detailsTable(rows) {
  if (!rows || !rows.length) return '';
  const cells = rows
    .filter(Boolean)
    .map(([label, value, opts = {}]) => `
      <tr>
        <td style="padding:7px 0;font-size:14px;color:${BRAND.muted};">${escapeHtml(label)}</td>
        <td align="right" style="padding:7px 0;font-size:14px;color:${opts.color || BRAND.text};font-weight:${opts.strong ? 700 : 500};">${escapeHtml(value)}</td>
      </tr>`)
    .join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.soft};border:1px solid ${BRAND.line};border-radius:12px;margin:22px 0;">
      <tr><td style="padding:12px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cells}</table>
      </td></tr>
    </table>`;
}

function button(label, url) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px;">
      <tr><td align="center" bgcolor="${BRAND.teal}" style="border-radius:10px;">
        <a href="${url}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(label)}</a>
      </td></tr>
    </table>`;
}

/**
 * Builds { html, text } for an email.
 * @param {object} o
 *   preheader  inbox preview line
 *   eyebrow    small label above the heading
 *   heading    main title
 *   greeting   e.g. "Hello Kato,"
 *   paragraphs plain-text paragraphs (escaped)
 *   details    rows for the summary box
 *   extraHtml  trusted HTML inserted after the details (e.g. receipt lines)
 *   cta        { label, url }
 *   showLink   show the raw CTA link under the button
 *   note       small grey text at the end of the body
 *   fromShop   { name, phone, address } shown in the footer instead of StockDesk
 */
function renderEmail(o) {
  const paragraphs = (o.paragraphs || [])
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${BRAND.text};">${escapeHtml(p)}</p>`)
    .join('');
  const cta = o.cta ? button(o.cta.label, o.cta.url) : '';
  const link = o.cta && o.showLink
    ? `<p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:${BRAND.muted};">Button not working? Copy this link into your browser:<br><a href="${o.cta.url}" style="color:${BRAND.tealDark};word-break:break-all;">${escapeHtml(o.cta.url)}</a></p>`
    : '';
  const note = o.note ? `<p style="margin:22px 0 0;padding-top:18px;border-top:1px solid ${BRAND.line};font-size:13px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(o.note)}</p>` : '';
  const footer = o.fromShop
    ? `${escapeHtml(o.fromShop.name)}${o.fromShop.address ? ` · ${escapeHtml(o.fromShop.address)}` : ''}${o.fromShop.phone ? ` · ${escapeHtml(o.fromShop.phone)}` : ''}<br><span style="color:#94a3b8;">Receipt sent with <a href="${BRAND.site}" style="color:#94a3b8;">StockDesk</a></span>`
    : `StockDesk Inventory · Kampala, Uganda<br><a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.muted};">${BRAND.supportEmail}</a> · WhatsApp ${escapeHtml(BRAND.supportWhatsapp)} · <a href="${BRAND.site}" style="color:${BRAND.muted};">stockdeskinventory.com</a>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(o.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f6;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(o.preheader || '')}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;">
  <tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr><td style="padding:0 6px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle"><img src="${getBrandLogoUrl()}" width="34" height="34" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:8px;"><span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:18px;font-weight:800;color:${BRAND.ink};letter-spacing:-0.02em;">${escapeHtml(o.brandName || BRAND.name)}</span></td>
        </tr></table>
      </td></tr>
      <tr><td style="background:#ffffff;border:1px solid ${BRAND.line};border-radius:16px;overflow:hidden;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="height:4px;background:${BRAND.teal};background:linear-gradient(90deg,${BRAND.teal},#22d3ee);font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:32px 34px 30px;">
            ${o.eyebrow ? `<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${BRAND.teal};">${escapeHtml(o.eyebrow)}</p>` : ''}
            <h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;font-weight:800;color:${BRAND.ink};letter-spacing:-0.02em;">${escapeHtml(o.heading)}</h1>
            ${o.greeting ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${BRAND.text};">${escapeHtml(o.greeting)}</p>` : ''}
            ${paragraphs}
            ${detailsTable(o.details)}
            ${o.extraHtml || ''}
            ${cta}
            ${link}
            ${note}
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:20px 16px 0;font-size:12px;line-height:1.7;color:${BRAND.muted};">${footer}</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const textParts = [
    o.heading,
    o.greeting,
    ...(o.paragraphs || []).filter(Boolean),
    ...(o.details || []).filter(Boolean).map(([l, v]) => `${l}: ${v}`),
    o.extraText,
    o.cta ? `${o.cta.label}: ${o.cta.url}` : null,
    o.note,
    o.fromShop ? `${o.fromShop.name}${o.fromShop.phone ? ` · ${o.fromShop.phone}` : ''}` : `StockDesk Inventory · ${BRAND.supportEmail} · WhatsApp ${BRAND.supportWhatsapp}`,
  ];
  return { html, text: textParts.filter(Boolean).join('\n\n') };
}

// ── Public API ────────────────────────────────────────────────────────────────

async function sendVerificationEmail(to, token, { name, shopName } = {}) {
  const url = buildVerificationUrl(token);
  const shop = shopName || 'your shop';
  const { html, text } = renderEmail({
    preheader: `Confirm your email to open ${shop} on StockDesk. Your first month is free.`,
    eyebrow: 'Welcome to StockDesk',
    heading: 'Confirm your email address',
    greeting: `Hello ${name || 'there'},`,
    paragraphs: [
      `Thanks for signing up. Confirm this email address and we will create ${shop} straight away.`,
      'Your first month is free, with every feature. No card or Mobile Money is needed to start.',
    ],
    cta: { label: 'Confirm email and open my shop', url },
    showLink: true,
    note: "This link expires in 48 hours. If you didn't sign up for StockDesk, you can ignore this email and nothing will be created.",
  });
  await sendEmail({ to, subject: `Confirm your email for ${shopName || 'StockDesk'}`, html, text });
}

async function sendPasswordResetEmail(to, token) {
  const url = buildResetUrl(token);
  const { html, text } = renderEmail({
    preheader: 'Use this link within 1 hour to choose a new StockDesk password.',
    eyebrow: 'Account security',
    heading: 'Reset your password',
    paragraphs: [
      'We received a request to reset the password for your StockDesk account. Click the button below to choose a new one.',
      'For your security, signing in with the new password signs you out on your other devices.',
    ],
    cta: { label: 'Choose a new password', url },
    showLink: true,
    note: "This link expires in 1 hour and can be used once. If you didn't ask for a reset, ignore this email: your password stays the same.",
  });
  await sendEmail({ to, subject: 'Reset your StockDesk password', html, text });
}

try {
  console.log(`[emailService] Provider on boot: ${getProvider()}`);
} catch (error) {
  console.log(`[emailService] Provider on boot: unavailable (${error.message})`);
}

// Subscription emails: trial and renewal reminders, payment requests and
// payment confirmations. `lines` are plain-text paragraphs.
async function sendBillingEmail(to, { subject, heading, lines = [], details, ctaLabel = 'Open billing', ctaPath = '/app/billing', preheader }) {
  const { html, text } = renderEmail({
    preheader: preheader || lines[0] || heading,
    eyebrow: 'Your StockDesk subscription',
    heading,
    paragraphs: lines,
    details,
    cta: { label: ctaLabel, url: `${getFrontendUrl()}${ctaPath}` },
    note: 'Questions about billing? Reply to this email or message us on WhatsApp and a person will help.',
  });
  await sendEmail({ to, subject, html, text });
}

// A sale receipt for a customer, with the PDF attached.
async function sendReceiptEmail(to, { shopName, shopPhone, shopAddress, replyTo, receiptNumber, date, cashier, customerName, items = [], totals = [], paymentMethod, balanceDue, currency, pdf, message }) {
  const money = (n) => `${currency} ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const itemRows = items.map((it) => `
      <tr>
        <td style="padding:9px 0;border-bottom:1px solid ${BRAND.line};font-size:14px;color:${BRAND.text};">${escapeHtml(it.name)}<br><span style="font-size:12px;color:${BRAND.muted};">${it.quantity} × ${escapeHtml(money(it.price))}</span></td>
        <td align="right" style="padding:9px 0;border-bottom:1px solid ${BRAND.line};font-size:14px;font-weight:600;color:${BRAND.text};white-space:nowrap;">${escapeHtml(money(it.price * it.quantity))}</td>
      </tr>`).join('');
  const totalRows = totals.map(([label, value, strong]) => `
      <tr>
        <td style="padding:${strong ? '12px' : '5px'} 0 ${strong ? '4px' : '5px'};font-size:${strong ? 16 : 14}px;font-weight:${strong ? 800 : 500};color:${strong ? BRAND.ink : BRAND.muted};">${escapeHtml(label)}</td>
        <td align="right" style="padding:${strong ? '12px' : '5px'} 0 ${strong ? '4px' : '5px'};font-size:${strong ? 16 : 14}px;font-weight:${strong ? 800 : 500};color:${BRAND.ink};white-space:nowrap;">${escapeHtml(value)}</td>
      </tr>`).join('');
  const extraHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;">
      ${itemRows}
      ${totalRows}
    </table>`;
  const extraText = [...items.map((it) => `${it.name}  ${it.quantity} x ${money(it.price)} = ${money(it.price * it.quantity)}`), ...totals.map(([l, v]) => `${l}: ${v}`)].join('\n');

  const { html, text } = renderEmail({
    brandName: shopName,
    preheader: `Receipt ${receiptNumber} from ${shopName}${totals.length ? `: ${totals[totals.length - 1][1]}` : ''}. PDF attached.`,
    eyebrow: `Receipt ${receiptNumber}`,
    heading: `Thank you for shopping with ${shopName}`,
    greeting: customerName ? `Hello ${customerName},` : null,
    paragraphs: [message || 'Here is your receipt. A PDF copy is attached for your records.'],
    details: [
      ['Receipt', receiptNumber],
      ['Date', date],
      ['Served by', cashier],
      ['Paid by', paymentMethod],
      balanceDue > 0 ? ['Balance still owed', money(balanceDue), { strong: true, color: '#b45309' }] : null,
    ],
    extraHtml,
    extraText,
    note: 'Keep this receipt for returns and warranty. Reply to this email if anything looks wrong.',
    fromShop: { name: shopName, phone: shopPhone, address: shopAddress },
  });

  await sendEmail({
    to,
    subject: `Your receipt from ${shopName} (${receiptNumber})`,
    html,
    text,
    fromName: `${shopName} via StockDesk`.slice(0, 70),
    replyTo,
    attachments: pdf ? [{ filename: `receipt-${receiptNumber}.pdf`, content: pdf, contentType: 'application/pdf' }] : undefined,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendBillingEmail, sendReceiptEmail, renderEmail };
