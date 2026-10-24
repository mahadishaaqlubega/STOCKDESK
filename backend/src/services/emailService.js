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

async function sendViaSmtp({ to, subject, html, text }) {
  const fromName = getFromName();
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
  });
}

// ── Resend API transport ───────────────────────────────────────────────────────

async function sendViaResend({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromName = getFromName();
  const fromEmail = getFromEmail('resend');

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is required for Resend email delivery.');
  }
  if (!fromEmail) {
    throw new Error('RESEND_FROM_EMAIL, EMAIL_FROM, or SMTP_FROM_EMAIL is required for Resend email delivery.');
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    html,
    ...(text ? { text } : {}),
  });
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

// ── Public API ────────────────────────────────────────────────────────────────

async function sendVerificationEmail(to, token, { name, shopName } = {}) {
  const url = buildVerificationUrl(token);
  const displayName = name || 'there';
  const displayShop = shopName || 'StockDesk';

  await sendEmail({
    to,
    subject: `Verify your email for ${displayShop}`,
    html: `
      <div style="font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;padding:32px;color:#0f172a">
        <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
          <div style="background:linear-gradient(135deg,#0f766e,#1f7a8c);padding:24px 32px;color:#fff;text-align:center">
            <img src="${getBrandLogoUrl()}" alt="StockDesk" width="220" style="display:block;margin:0 auto 14px;max-width:220px;height:auto;border-radius:10px;background:#ffffff;padding:8px 14px" />
            <h1 style="margin:0;font-size:26px">Verify Your Email</h1>
            <p style="margin:10px 0 0;font-size:14px;opacity:.9">Activate administrator access for ${displayShop}</p>
          </div>
          <div style="padding:32px">
            <p style="margin:0 0 14px;font-size:15px;line-height:1.7">Hello ${displayName},</p>
            <p style="margin:0 0 14px;font-size:15px;line-height:1.7">Your new StockDesk shop has been created. Click the button below to verify your email address and activate your account.</p>
            <div style="margin:28px 0">
              <a href="${url}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:13px 28px;border-radius:999px;font-weight:600">Verify Email</a>
            </div>
            <p style="margin:0 0 8px;font-size:13px;color:#475569">If the button doesn't work, paste this link into your browser:</p>
            <p style="margin:0 0 20px;font-size:12px;word-break:break-word;color:#0f766e">${url}</p>
            <p style="margin:0;font-size:13px;color:#64748b">If you didn't create this account, you can ignore this email.</p>
          </div>
        </div>
      </div>
    `,
    text: `Hello ${displayName},\n\nVerify your email for ${displayShop}:\n${url}\n\nIf you didn't create this account, ignore this email.`,
  });
}

async function sendPasswordResetEmail(to, token) {
  const url = buildResetUrl(token);

  await sendEmail({
    to,
    subject: 'Reset your StockDesk password',
    html: `
      <div style="font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;padding:32px;color:#0f172a">
        <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
          <div style="background:linear-gradient(135deg,#0f766e,#1f7a8c);padding:24px 32px;color:#fff;text-align:center">
            <img src="${getBrandLogoUrl()}" alt="StockDesk" width="220" style="display:block;margin:0 auto 14px;max-width:220px;height:auto;border-radius:10px;background:#ffffff;padding:8px 14px" />
            <h1 style="margin:0;font-size:26px">Reset Your Password</h1>
            <p style="margin:10px 0 0;font-size:14px;opacity:.9">This link expires in 1 hour</p>
          </div>
          <div style="padding:32px">
            <p style="margin:0 0 14px;font-size:15px;line-height:1.7">Click the button below to set a new password for your StockDesk account.</p>
            <div style="margin:28px 0">
              <a href="${url}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:13px 28px;border-radius:999px;font-weight:600">Reset Password</a>
            </div>
            <p style="margin:0 0 8px;font-size:13px;color:#475569">If the button doesn't work, paste this link into your browser:</p>
            <p style="margin:0 0 20px;font-size:12px;word-break:break-word;color:#0f766e">${url}</p>
            <p style="margin:0;font-size:13px;color:#64748b">If you didn't request a password reset, you can safely ignore this email.</p>
          </div>
        </div>
      </div>
    `,
    text: `Reset your StockDesk password:\n${url}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
  });
}

try {
  console.log(`[emailService] Provider on boot: ${getProvider()}`);
} catch (error) {
  console.log(`[emailService] Provider on boot: unavailable (${error.message})`);
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Subscription emails: trial and renewal reminders, payment requests and
// payment confirmations. `lines` are plain-text paragraphs.
async function sendBillingEmail(to, { subject, heading, lines = [], ctaLabel = 'Open billing', ctaPath = '/app/billing' }) {
  const url = `${getFrontendUrl()}${ctaPath}`;
  const paragraphs = lines
    .map((line) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.7">${escapeHtml(line)}</p>`)
    .join('');

  await sendEmail({
    to,
    subject,
    html: `
      <div style="font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;padding:32px;color:#0f172a">
        <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
          <div style="background:linear-gradient(135deg,#0f766e,#1f7a8c);padding:24px 32px;color:#fff;text-align:center">
            <img src="${getBrandLogoUrl()}" alt="StockDesk" width="220" style="display:block;margin:0 auto 14px;max-width:220px;height:auto;border-radius:10px;background:#ffffff;padding:8px 14px" />
            <h1 style="margin:0;font-size:24px">${escapeHtml(heading)}</h1>
          </div>
          <div style="padding:32px">
            ${paragraphs}
            <div style="margin:28px 0 8px">
              <a href="${url}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:13px 28px;border-radius:999px;font-weight:600">${escapeHtml(ctaLabel)}</a>
            </div>
            <p style="margin:18px 0 0;font-size:13px;color:#64748b">Questions? Reply to this email or WhatsApp +256 742 226 839.</p>
          </div>
        </div>
      </div>
    `,
    text: [heading, ...lines, `${ctaLabel}: ${url}`].join('\n\n'),
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendBillingEmail };
