// WhatsApp "click to chat": opens WhatsApp (app on phones, WhatsApp Web or
// Desktop on computers) with the message already typed; the user presses
// Send. Free, needs no WhatsApp Business account.
import { formatMoney } from './format';

// Dialling codes by shop currency, used when a number is written locally
// (0772 123456) and the shop phone doesn't tell us the country.
const CURRENCY_COUNTRY = {
  UGX: '256', KES: '254', TZS: '255', RWF: '250', BIF: '257', SSP: '211', CDF: '243',
  ETB: '251', NGN: '234', GHS: '233', ZAR: '27', ZMW: '260', MWK: '265', USD: '1', GBP: '44',
};

export function countryCodeFor(settings) {
  const shopPhone = String(settings?.phone || '').replace(/[^\d+]/g, '');
  const intl = /^\+(\d{1,3})/.exec(shopPhone);
  if (intl) {
    // Prefer the code that matches the currency when the shop phone agrees.
    const byCurrency = CURRENCY_COUNTRY[settings?.currency];
    if (byCurrency && shopPhone.startsWith(`+${byCurrency}`)) return byCurrency;
    return intl[1].length === 3 ? intl[1] : intl[1].slice(0, 3);
  }
  return CURRENCY_COUNTRY[settings?.currency] || '256';
}

// "0772 123 456" -> "256772123456"; "+256 772..." -> "256772..."; null when
// it can't be a phone number.
export function toWhatsAppNumber(raw, countryCode = '256') {
  const value = String(raw || '').trim();
  if (!value) return null;
  let digits = value.replace(/\D/g, '');
  if (value.startsWith('+')) return digits.length >= 8 ? digits : null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = countryCode + digits.slice(1);
  else if (digits.length <= 9) digits = countryCode + digits;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function customerWhatsApp(customer, settings) {
  return toWhatsAppNumber(customer?.whatsapp || customer?.phone, countryCodeFor(settings));
}

export function whatsappLink(number, text) {
  const base = number ? `https://wa.me/${number}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}

// Opens WhatsApp in a new tab/app. Must run inside the click handler (no
// await before it) or browsers block the pop-up.
export function openWhatsApp(number, text) {
  window.open(whatsappLink(number, text), '_blank', 'noopener');
}

export function publicReceiptUrl(apiBase, token) {
  if (!token) return '';
  const base = /^https?:\/\//.test(apiBase) ? apiBase : `${window.location.origin}${apiBase}`;
  return `${base.replace(/\/$/, '')}/public/receipts/${token}`;
}

const shortDate = (value) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const dueDate = (value) => (value ? shortDate(`${value}T00:00:00`) : '');

export function receiptMessage(sale, settings, link) {
  const currency = sale.currency || settings?.currency || 'UGX';
  const shopName = settings?.shop?.name || settings?.shopName || 'our shop';
  const items = sale.items || [];
  const lines = items.slice(0, 15).map((item) => {
    const name = (item.Product?.name || item.name || 'Item').trim();
    return `${item.quantity} × ${name}: ${formatMoney(currency, Number(item.price) * Number(item.quantity))}`;
  });
  if (items.length > 15) lines.push(`+ ${items.length - 15} more item${items.length - 15 === 1 ? '' : 's'}`);
  const total = Number(sale.total || 0);
  const balance = Number(sale.balanceDue || 0);
  const number = sale.receipt?.receiptNumber || `SD-${String(sale.id).padStart(6, '0')}`;
  const named = sale.customer?.name && sale.customer.name !== 'Walk-in Customer';
  const firstName = named ? String(sale.customer.name).trim().split(/\s+/)[0] : '';

  return [
    `Hello${firstName ? ` ${firstName}` : ''}, thank you for shopping with us!`,
    '',
    `*${shopName}*`,
    `Receipt ${number} · ${shortDate(sale.createdAt)}`,
    '',
    ...lines,
    '',
    `Total: *${formatMoney(currency, total)}*`,
    ...(balance > 0
      ? [`Paid: ${formatMoney(currency, total - balance)}`, `Balance due: *${formatMoney(currency, balance)}*${sale.dueDate ? ` (by ${dueDate(sale.dueDate)})` : ''}`]
      : [`Paid by ${sale.paymentMethod === 'Split' ? 'split payment' : sale.paymentMethod}`]),
    ...(link ? ['', `Your receipt: ${link}`] : []),
    '',
    settings?.receiptFooter || 'Thank you for your business!',
  ].join('\n');
}

// Debt reminder. `openSales` (from the credit statement) adds the receipts
// that make up the balance; without it only the total is mentioned.
export function reminderMessage(customer, balance, settings, openSales = []) {
  const currency = settings?.currency || 'UGX';
  const shopName = settings?.shop?.name || settings?.shopName || 'our shop';
  const firstName = String(customer?.name || '').trim().split(/\s+/)[0] || 'there';
  const today = new Date();
  const lines = openSales.slice(0, 8).map((sale) => {
    const overdue = sale.dueDate && new Date(`${sale.dueDate}T23:59:59`) < today;
    const due = sale.dueDate ? `, ${overdue ? 'was due' : 'due'} ${dueDate(sale.dueDate)}` : '';
    return `• ${sale.receipt?.receiptNumber || `#${sale.id}`} (${shortDate(sale.createdAt)}): ${formatMoney(currency, sale.balanceDue)}${due}`;
  });
  const anyOverdue = openSales.some((sale) => sale.dueDate && new Date(`${sale.dueDate}T23:59:59`) < today);

  return [
    `Hello ${firstName},`,
    '',
    `This is ${shopName}. ${anyOverdue ? 'This is a reminder that part of your balance is now overdue.' : 'A friendly reminder about your balance with us.'}`,
    `Amount owed: *${formatMoney(currency, balance)}*`,
    ...(lines.length ? ['', ...lines] : []),
    '',
    `You can pay at the shop${settings?.phone ? ` or by Mobile Money to ${settings.phone}` : ''}.`,
    'Thank you!',
  ].join('\n');
}
