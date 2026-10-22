import { useMemo, useRef } from 'react';
import { currencyDecimals } from '../../utils/format';

/**
 * Sales receipt.
 *
 * One HTML document is generated per sale and used both for the on-screen
 * preview (an iframe) and for printing (printing that same iframe), so what
 * the cashier sees is exactly what comes out of the printer. The layout is
 * monochrome and sized for 80mm thermal paper; it also prints cleanly on A4.
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function amount(currency, value) {
  const decimals = currencyDecimals(currency);
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatDueDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function buildReceiptHtml(sale, settings, cashierName) {
  const currency = sale.currency || settings?.currency || 'UGX';
  const money = (value) => amount(currency, value);
  const shopName = settings?.shop?.name || settings?.shopName || 'StockDesk';
  const createdAt = new Date(sale.createdAt);
  const receiptNumber = sale.receipt?.receiptNumber || `SD-${String(sale.id).padStart(6, '0')}`;

  const items = (sale.items || []).map((item) => ({
    name: item.Product?.name || item.name || 'Item',
    quantity: Number(item.quantity || 0),
    price: Number(item.price || 0),
  }));
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const units = items.reduce((sum, item) => sum + item.quantity, 0);
  const discount = Number(sale.discount || 0);
  const taxAmount = Number(sale.taxAmount || 0);
  const taxRate = Number(sale.tax != null ? sale.tax : settings?.vat || 0);
  const total = Number(sale.total || 0);
  const balanceDue = Number(sale.balanceDue || 0);
  const isCredit = Number(sale.creditAmount || 0) > 0;
  const customer = sale.customer && sale.customer.name !== 'Walk-in Customer' ? sale.customer : null;
  const splits = Array.isArray(sale.paymentSplits) ? sale.paymentSplits.filter((split) => Number(split.amount) > 0) : [];

  const row = (label, value, cls = '') => `<div class="row ${cls}"><span>${label}</span><span class="n">${value}</span></div>`;

  const itemsHtml = items
    .map(
      (item) => `
        <div class="item">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="row sub"><span>${item.quantity} × ${money(item.price)}</span><span class="n">${money(item.price * item.quantity)}</span></div>
        </div>`
    )
    .join('');

  const paymentHtml = isCredit
    ? `
      ${splits.filter((s) => s.method !== 'Credit').map((s) => row(`Paid (${escapeHtml(s.method)})`, money(s.amount))).join('') || row('Paid', money(total - balanceDue))}
      <div class="due">
        <div class="row"><span>BALANCE DUE</span><span class="n">${currency} ${money(balanceDue)}</span></div>
        ${sale.dueDate ? `<div class="due-date">Please pay by ${escapeHtml(formatDueDate(sale.dueDate))}</div>` : ''}
      </div>`
    : sale.paymentMethod === 'Split' && splits.length
      ? splits.map((s) => row(escapeHtml(s.method), money(s.amount))).join('')
      : row('Paid by', escapeHtml(sale.paymentMethod || '—'));

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt ${escapeHtml(receiptNumber)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #000; }
  body {
    font-family: 'Inter', 'Segoe UI', Roboto, Arial, sans-serif;
    font-size: 12px;
    line-height: 1.4;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .paper { width: 72mm; margin: 0 auto; padding: 14px 2px 18px; }
  .center { text-align: center; }
  .logo { max-width: 34mm; max-height: 18mm; object-fit: contain; display: block; margin: 0 auto 8px; }
  .shop { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
  .muted { color: #444; font-size: 11px; }
  .note { margin-top: 6px; font-size: 11px; color: #222; }
  hr { border: 0; border-top: 1px dashed #000; margin: 10px 0; }
  hr.solid { border-top: 1px solid #000; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .row > span:first-child { min-width: 0; }
  .n { font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
  .meta .row { font-size: 11px; padding: 1px 0; }
  .meta .row > span:first-child { color: #444; }
  .item { padding: 4px 0; }
  .item-name { font-weight: 600; word-break: break-word; }
  .sub { color: #333; font-size: 11px; }
  .totals .row { padding: 2px 0; }
  .grand { font-size: 16px; font-weight: 700; padding: 6px 0 !important; }
  .due { border: 1.5px solid #000; border-radius: 4px; padding: 6px 8px; margin-top: 6px; font-weight: 700; }
  .due-date { font-weight: 500; font-size: 11px; margin-top: 2px; }
  .thanks { font-size: 13px; font-weight: 600; margin-top: 2px; }
  .powered { margin-top: 10px; font-size: 9px; color: #666; letter-spacing: 0.04em; }
  @media screen { body { padding: 8px 0; } }
</style>
</head>
<body>
  <main class="paper">
    <header class="center">
      ${settings?.shopLogoUrl ? `<img class="logo" src="${escapeHtml(settings.shopLogoUrl)}" alt="" />` : ''}
      <div class="shop">${escapeHtml(shopName)}</div>
      ${settings?.address ? `<div class="muted">${escapeHtml(settings.address)}</div>` : ''}
      ${settings?.phone ? `<div class="muted">Tel: ${escapeHtml(settings.phone)}</div>` : ''}
      ${settings?.receiptHeader ? `<div class="note">${escapeHtml(settings.receiptHeader)}</div>` : ''}
    </header>

    <hr />
    <section class="meta">
      ${row('Receipt', escapeHtml(receiptNumber))}
      ${row('Date', escapeHtml(createdAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })))}
      ${row('Time', escapeHtml(createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })))}
      ${row('Served by', escapeHtml(cashierName || sale.cashier?.name || '—'))}
      ${customer ? row('Customer', escapeHtml(customer.name)) : ''}
      ${customer?.phone ? row('Phone', escapeHtml(customer.phone)) : ''}
    </section>
    <hr />

    <section>${itemsHtml}</section>

    <hr />
    <section class="totals">
      ${row(`Subtotal (${units} item${units === 1 ? '' : 's'})`, money(subtotal))}
      ${discount > 0 ? row('Discount', `−${money(discount)}`) : ''}
      ${taxAmount > 0 ? row(`VAT ${taxRate}%`, money(taxAmount)) : ''}
      <hr class="solid" />
      ${row('TOTAL', `${currency} ${money(total)}`, 'grand')}
      ${paymentHtml}
    </section>
    <hr />

    <footer class="center">
      <div class="thanks">${escapeHtml(settings?.receiptFooter || 'Thank you for your business!')}</div>
      <div class="muted">Keep this receipt for returns and warranty.</div>
      <div class="powered">POWERED BY STOCKDESK</div>
    </footer>
  </main>
</body>
</html>`;
}

export default function PosReceipt({ sale, settings, cashierName, onClose }) {
  const frameRef = useRef(null);
  const html = useMemo(() => (sale && settings ? buildReceiptHtml(sale, settings, cashierName) : ''), [sale, settings, cashierName]);

  if (!html) return null;

  const receiptNumber = sale.receipt?.receiptNumber || sale.id;
  const balanceDue = Number(sale.balanceDue || 0);

  const handlePrint = () => {
    // Print the preview frame itself: no pop-up window (often blocked on
    // phones) and identical output to what is shown on screen.
    const frameWindow = frameRef.current?.contentWindow;
    if (!frameWindow) return;
    frameWindow.focus();
    frameWindow.print();
  };

  const resizeFrame = () => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (frame && doc?.body) {
      frame.style.height = `${doc.documentElement.scrollHeight}px`;
    }
  };

  return (
    <div className="app-overlay fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="app-modal flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] px-5 py-4">
          <div className="min-w-0">
            <p id="receipt-title" className="text-base font-semibold text-[var(--text-primary)]">Sale complete</p>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              Receipt {receiptNumber}
              {balanceDue > 0 ? <span className="font-medium text-[var(--warning)]"> · balance due</span> : null}
            </p>
          </div>
          <button type="button" onClick={onClose} className="app-btn-subtle rounded-full p-2" aria-label="Close receipt">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-[var(--surface-secondary)] px-4 py-5">
          <div className="mx-auto w-full max-w-[320px] rounded-sm bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_24px_-8px_rgba(0,0,0,0.25)]">
            <iframe
              ref={frameRef}
              title={`Receipt ${receiptNumber}`}
              srcDoc={html}
              onLoad={resizeFrame}
              className="block w-full border-0"
              style={{ height: 560 }}
            />
          </div>
        </div>

        <div className="flex gap-2 border-t border-[var(--border-default)] px-5 py-4">
          <button type="button" onClick={onClose} className="app-btn-secondary flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium">
            New sale
          </button>
          <button type="button" onClick={handlePrint} className="app-btn-primary flex-1 rounded-xl px-4 py-2.5 text-sm">
            Print receipt
          </button>
        </div>
      </div>
    </div>
  );
}
