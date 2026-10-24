// Shared helpers for subscription screens (shop Billing page and owner console).

export const STATE_META = {
  trial: { label: 'Free trial', tone: 'info' },
  active: { label: 'Paid', tone: 'success' },
  past_due: { label: 'Payment due', tone: 'warning' },
  expired: { label: 'Read-only', tone: 'danger' },
};

export function stateLabel(status) {
  if (!status) return '';
  const base = STATE_META[status.state]?.label || status.state;
  if ((status.state === 'trial' || status.state === 'active') && status.daysLeft != null) {
    return `${base} · ${status.daysLeft} day${status.daysLeft === 1 ? '' : 's'} left`;
  }
  return base;
}

export const money = (n, currency = 'UGX') => `${currency} ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function planName(config, key) {
  return config?.plans?.find((p) => p.key === key)?.name || (key ? key[0].toUpperCase() + key.slice(1) : 'No plan yet');
}

export function toWhatsappNumber(raw) {
  let digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = `256${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith('7')) digits = `256${digits}`;
  return digits;
}

export function whatsappLink(phone, text) {
  const number = toWhatsappNumber(phone);
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  return number ? `https://wa.me/${number}${q}` : `https://wa.me/${q}`;
}

// Ready-made WhatsApp messages the owner can send from the console.
export function billingMessage(kind, { shopName, ownerName, amount, planLabel, endsAt, payTo, currency = 'UGX' }) {
  const hi = `Hello${ownerName ? ` ${ownerName}` : ''},`;
  const pay = [payTo?.mtnNumber && `MTN MoMo ${payTo.mtnNumber}`, payTo?.airtelNumber && `Airtel Money ${payTo.airtelNumber}`].filter(Boolean).join(' or ');
  const payLine = pay ? ` Pay to ${pay}${payTo?.accountName ? ` (${payTo.accountName})` : ''}, then enter the transaction ID under Billing in StockDesk.` : ' Open Billing in StockDesk to pay.';
  const amountText = amount ? money(amount, currency) : '';
  switch (kind) {
    case 'trial_ending':
      return `${hi} your free month of StockDesk for ${shopName} ends on ${fmtDate(endsAt)}. To keep selling without a break, choose a plan${amountText ? ` (${planLabel}: ${amountText} a month)` : ''}.${payLine}`;
    case 'renewal':
      return `${hi} ${shopName}'s StockDesk plan is paid until ${fmtDate(endsAt)}. Renew${amountText ? ` with ${amountText}` : ''} to keep going.${payLine}`;
    case 'overdue':
      return `${hi} the StockDesk payment for ${shopName} is overdue${amountText ? ` (${amountText})` : ''}. Soon the shop will become read-only, though no records are ever deleted.${payLine}`;
    case 'expired':
      return `${hi} ${shopName} is read-only on StockDesk because the subscription ended. Your records are safe.${payLine} Selling starts again as soon as we confirm the payment.`;
    case 'request':
      return `${hi} here is your StockDesk payment request for ${shopName}: ${amountText} for the ${planLabel} plan.${payLine}`;
    default:
      return `${hi} this is StockDesk.`;
  }
}

export function messageKindFor(state) {
  return { trial: 'trial_ending', active: 'renewal', past_due: 'overdue', expired: 'expired' }[state] || 'renewal';
}

export function downloadCsv(filename, rows) {
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(escape).join(',')).join('\r\n');
  // Byte-order mark so Excel opens the file as UTF-8.
  const blob = new Blob([String.fromCharCode(0xfeff), csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
