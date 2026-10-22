import { useMemo, useRef, useState } from 'react';
import { currencyDecimals } from '../../utils/format';
import { PAPER_SIZES, getPrintSettings, savePrintSettings } from '../../utils/printSettings';

/**
 * Sales receipt.
 *
 * One HTML document is generated per sale and used both for the on-screen
 * preview (an iframe) and for printing (printing that same iframe), so what
 * the cashier sees is exactly what comes out of the printer. Printing goes
 * through the device's print system, so any printer works: thermal rolls
 * (80 mm / 58 mm) get a compact monochrome slip, A4 printers get a full
 * invoice layout.
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

// Everything both layouts need, derived once.
function receiptModel(sale, settings, cashierName) {
  const currency = sale.currency || settings?.currency || 'UGX';
  const items = (sale.items || []).map((item) => {
    const price = Number(item.price || 0);
    const product = item.Product || {};
    return {
      name: (product.name || item.name || '').trim() || 'Item',
      detail: product.type === 'service' ? 'Service' : (product.category || '').trim(),
      quantity: Number(item.quantity || 0),
      price,
      // Catalogue price before a per-item discount (older sales: same as price).
      listPrice: Math.max(price, Number(item.listPrice || 0)),
    };
  });
  const total = Number(sale.total || 0);
  const balanceDue = Number(sale.balanceDue || 0);
  return {
    currency,
    money: (value) => amount(currency, value),
    shopName: settings?.shop?.name || settings?.shopName || 'StockDesk',
    address: settings?.address || '',
    phone: settings?.phone || '',
    logo: settings?.shopLogoUrl || '',
    headerNote: settings?.receiptHeader || '',
    footerNote: settings?.receiptFooter || 'Thank you for your business!',
    createdAt: new Date(sale.createdAt),
    receiptNumber: sale.receipt?.receiptNumber || `SD-${String(sale.id).padStart(6, '0')}`,
    cashier: cashierName || sale.cashier?.name || '—',
    customer: sale.customer && sale.customer.name !== 'Walk-in Customer' ? sale.customer : null,
    items,
    units: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    itemSavings: items.reduce((sum, item) => sum + (item.listPrice - item.price) * item.quantity, 0),
    discount: Number(sale.discount || 0),
    taxAmount: Number(sale.taxAmount || 0),
    taxRate: Number(sale.tax != null ? sale.tax : settings?.vat || 0),
    total,
    balanceDue,
    paid: total - balanceDue,
    isCredit: Number(sale.creditAmount || 0) > 0,
    dueDate: sale.dueDate || null,
    paymentMethod: sale.paymentMethod || '—',
    splits: Array.isArray(sale.paymentSplits) ? sale.paymentSplits.filter((split) => Number(split.amount) > 0) : [],
  };
}

function buildThermalHtml(m, paper) {
  const width = paper === '58mm' ? 48 : 72;
  const row = (label, value, cls = '') => `<div class="row ${cls}"><span>${label}</span><span class="n">${value}</span></div>`;

  const itemsHtml = m.items
    .map((item) => `
        <div class="item">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="row sub"><span>${item.quantity} × ${m.money(item.price)}${item.listPrice > item.price ? ` <s>${m.money(item.listPrice)}</s>` : ''}</span><span class="n">${m.money(item.price * item.quantity)}</span></div>
        </div>`)
    .join('');

  const paymentHtml = m.isCredit
    ? `
      ${m.splits.filter((s) => s.method !== 'Credit').map((s) => row(`Paid (${escapeHtml(s.method)})`, m.money(s.amount))).join('') || row('Paid', m.money(m.paid))}
      <div class="due">
        <div class="row"><span>BALANCE DUE</span><span class="n">${m.currency} ${m.money(m.balanceDue)}</span></div>
        ${m.dueDate ? `<div class="due-date">Please pay by ${escapeHtml(formatDueDate(m.dueDate))}</div>` : ''}
      </div>`
    : m.paymentMethod === 'Split' && m.splits.length
      ? m.splits.map((s) => row(escapeHtml(s.method), m.money(s.amount))).join('')
      : row('Paid by', escapeHtml(m.paymentMethod));

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt ${escapeHtml(m.receiptNumber)}</title>
<style>
  @page { size: ${paper === '58mm' ? '58mm' : '80mm'} auto; margin: 3mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #000; }
  body { font-family: 'Inter', 'Segoe UI', Roboto, Arial, sans-serif; font-size: ${paper === '58mm' ? 11 : 12}px; line-height: 1.4; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .paper { width: ${width}mm; margin: 0 auto; padding: 12px 2px 16px; }
  .center { text-align: center; }
  .logo { max-width: ${Math.round(width * 0.45)}mm; max-height: 18mm; object-fit: contain; display: block; margin: 0 auto 6px; filter: grayscale(1); }
  .shop { font-size: ${paper === '58mm' ? 14 : 17}px; font-weight: 700; letter-spacing: -0.01em; }
  .muted { color: #444; font-size: ${paper === '58mm' ? 10 : 11}px; }
  .note { margin-top: 6px; font-size: 11px; color: #222; }
  hr { border: 0; border-top: 1px dashed #000; margin: 9px 0; }
  hr.solid { border-top: 1px solid #000; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .row > span:first-child { min-width: 0; }
  .n { font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
  .meta .row { font-size: 11px; padding: 1px 0; }
  .meta .row > span:first-child { color: #444; }
  .item { padding: 3px 0; }
  .item-name { font-weight: 600; word-break: break-word; }
  .sub { color: #333; font-size: 11px; }
  .totals .row { padding: 2px 0; }
  .grand { font-size: ${paper === '58mm' ? 14 : 16}px; font-weight: 700; padding: 5px 0 !important; }
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
      ${m.logo ? `<img class="logo" src="${escapeHtml(m.logo)}" alt="" />` : ''}
      <div class="shop">${escapeHtml(m.shopName)}</div>
      ${m.address ? `<div class="muted">${escapeHtml(m.address)}</div>` : ''}
      ${m.phone ? `<div class="muted">Tel: ${escapeHtml(m.phone)}</div>` : ''}
      ${m.headerNote ? `<div class="note">${escapeHtml(m.headerNote)}</div>` : ''}
    </header>
    <hr />
    <section class="meta">
      ${row('Receipt', escapeHtml(m.receiptNumber))}
      ${row('Date', escapeHtml(m.createdAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })))}
      ${row('Time', escapeHtml(m.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })))}
      ${row('Served by', escapeHtml(m.cashier))}
      ${m.customer ? row('Customer', escapeHtml(m.customer.name)) : ''}
      ${m.customer?.phone ? row('Phone', escapeHtml(m.customer.phone)) : ''}
    </section>
    <hr />
    <section>${itemsHtml}</section>
    <hr />
    <section class="totals">
      ${row(`Subtotal (${m.units} item${m.units === 1 ? '' : 's'})`, m.money(m.subtotal + m.itemSavings))}
      ${m.itemSavings > 0 ? row('Item discounts', `−${m.money(m.itemSavings)}`) : ''}
      ${m.discount > 0 ? row('Discount', `−${m.money(m.discount)}`) : ''}
      ${m.taxAmount > 0 ? row(`VAT ${m.taxRate}%`, m.money(m.taxAmount)) : ''}
      <hr class="solid" />
      ${row('TOTAL', `${m.currency} ${m.money(m.total)}`, 'grand')}
      ${paymentHtml}
    </section>
    <hr />
    <footer class="center">
      <div class="thanks">${escapeHtml(m.footerNote)}</div>
      <div class="muted">Keep this receipt for returns and warranty.</div>
      <div class="powered">POWERED BY STOCKDESK</div>
      <div class="powered">stockdeskinventory.com</div>
    </footer>
  </main>
</body>
</html>`;
}

// Full-page receipt for A4 printers: a calm, document-style layout (white
// page, hairline rules, generous whitespace) that matches the PDF.
function buildA4Html(m) {
  const cur = escapeHtml(m.currency);
  const withCurrency = (value) => `${cur} ${m.money(value)}`;
  const longDate = `${m.createdAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}, ${m.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  const paymentMethod = m.isCredit
    ? 'Credit'
    : m.paymentMethod === 'Split' && m.splits.length
      ? m.splits.map((s) => `${escapeHtml(s.method)} ${withCurrency(s.amount)}`).join(' · ')
      : escapeHtml(m.paymentMethod);
  const owing = m.isCredit && m.balanceDue > 0;
  const paymentStatus = owing ? (m.paid > 0 ? 'Part paid' : 'Unpaid') : 'Paid';

  const rows = m.items
    .map((item) => {
      const detail = [item.detail, item.listPrice > item.price ? `Was ${withCurrency(item.listPrice)}` : ''].filter(Boolean).join(' · ');
      return `
      <tr>
        <td>
          <div class="item">${escapeHtml(item.name)}</div>
          ${detail ? `<div class="detail">${escapeHtml(detail)}</div>` : ''}
        </td>
        <td class="num">${item.quantity}</td>
        <td class="num">${withCurrency(item.price)}</td>
        <td class="num">${withCurrency(item.price * item.quantity)}</td>
      </tr>`;
    })
    .join('');

  const sumRow = (label, value, cls = '') => `<div class="sum ${cls}"><span>${label}</span><span>${value}</span></div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt ${escapeHtml(m.receiptNumber)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #111827; }
  body { font-family: 'Inter', 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 16mm 18mm 14mm; display: flex; flex-direction: column; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .logo { display: block; max-width: 170px; max-height: 56px; object-fit: contain; margin-bottom: 14px; }
  .wordmark { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; color: #0d9488; margin-bottom: 6px; }
  .shop { font-size: 15px; font-weight: 600; }
  .line { color: #4b5563; }
  .doc { text-align: right; white-space: nowrap; }
  .doc h1 { margin: 0 0 6px; font-size: 30px; font-weight: 600; letter-spacing: -0.02em; }
  .doc .line strong { color: #111827; font-weight: 600; }
  hr { border: 0; border-top: 1px solid #e5e7eb; margin: 22px 0; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .label { font-size: 12px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #6b7280; margin-bottom: 8px; }
  .party-name { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  th { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #374151; text-align: left; padding: 0 0 12px; border-bottom: 1px solid #e5e7eb; }
  td { padding: 14px 0; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  th.num, td.num { text-align: right; white-space: nowrap; padding-left: 24px; font-variant-numeric: tabular-nums; }
  .item { font-weight: 500; }
  .detail { font-size: 12px; color: #6b7280; margin-top: 2px; }
  .sums { margin: 18px 0 0 auto; width: 330px; font-variant-numeric: tabular-nums; }
  .sum { display: flex; justify-content: space-between; padding: 4px 0; }
  .sum span:first-child { color: #4b5563; }
  .sum.total { border-top: 1px solid #e5e7eb; margin-top: 8px; padding-top: 12px; font-size: 19px; font-weight: 700; }
  .sum.total span:first-child { color: #111827; }
  .sum.owe { font-weight: 700; color: #b45309; }
  .sum.owe span:first-child { color: #b45309; }
  .pay { display: grid; grid-template-columns: repeat(${owing ? 3 : 2}, 1fr); gap: 20px; margin-top: 30px; padding: 16px 20px; background: #f6f7f9; border-radius: 14px; }
  .pay .k { font-size: 13px; color: #4b5563; }
  .pay .v { font-weight: 600; margin-top: 2px; }
  .pay .v.ok { color: #047857; }
  .pay .v.due { color: #b45309; }
  .note { margin-top: 22px; color: #4b5563; }
  .foot { margin-top: auto; padding-top: 18px; border-top: 1px solid #e5e7eb; text-align: center; color: #4b5563; font-size: 13px; }
  .foot .thanks { color: #111827; font-weight: 500; }
  .foot .brand { margin-top: 8px; font-size: 11px; color: #9ca3af; }
  .spacer { height: 36px; }
  @media screen and (min-width: 641px) and (max-width: 800px) { .page { zoom: 0.9; } }
  @media screen and (max-width: 640px) {
    .page { width: 100%; min-height: 0; padding: 22px 18px; }
    .head { flex-direction: column; }
    .doc { text-align: left; }
    .parties, .pay { grid-template-columns: 1fr; }
    .sums { width: 100%; }
    th.num, td.num { padding-left: 10px; }
  }
</style>
</head>
<body>
  <main class="page">
    <header class="head">
      <div>
        ${m.logo
          ? `<img class="logo" src="${escapeHtml(m.logo)}" alt="" /><div class="shop">${escapeHtml(m.shopName)}</div>`
          : `<div class="wordmark">${escapeHtml(m.shopName)}</div>`}
        ${m.address ? `<div class="line">${escapeHtml(m.address)}</div>` : ''}
        ${m.phone ? `<div class="line">${escapeHtml(m.phone)}</div>` : ''}
      </div>
      <div class="doc">
        <h1>Receipt</h1>
        <div class="line">Receipt <strong>${escapeHtml(m.receiptNumber)}</strong></div>
        <div class="line">${escapeHtml(longDate)}</div>
      </div>
    </header>

    <hr />

    <section class="parties">
      <div>
        <div class="label">Customer</div>
        ${m.customer
          ? `<div class="party-name">${escapeHtml(m.customer.name)}</div>
             ${m.customer.phone ? `<div>${escapeHtml(m.customer.phone)}</div>` : ''}
             ${m.customer.email ? `<div>${escapeHtml(m.customer.email)}</div>` : ''}`
          : '<div class="party-name">Walk-in customer</div>'}
      </div>
      <div>
        <div class="label">Served by</div>
        <div class="party-name">${escapeHtml(m.cashier)}</div>
        <div>${m.units} item${m.units === 1 ? '' : 's'}</div>
      </div>
    </section>

    <hr />

    <table>
      <thead>
        <tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <section class="sums">
      ${sumRow('Subtotal', withCurrency(m.subtotal + m.itemSavings))}
      ${m.itemSavings > 0 ? sumRow('Item discounts', `−${withCurrency(m.itemSavings)}`) : ''}
      ${m.discount > 0 ? sumRow('Discount', `−${withCurrency(m.discount)}`) : ''}
      ${m.taxAmount > 0 ? sumRow(`VAT ${m.taxRate}%`, withCurrency(m.taxAmount)) : ''}
      ${sumRow('Total', withCurrency(m.total), 'total')}
      ${m.isCredit ? sumRow('Paid', withCurrency(m.paid)) : ''}
      ${owing ? sumRow('Balance due', withCurrency(m.balanceDue), 'owe') : ''}
    </section>

    <section class="pay">
      <div><div class="k">Payment method</div><div class="v">${paymentMethod}</div></div>
      <div><div class="k">Payment status</div><div class="v ${owing ? 'due' : 'ok'}">${paymentStatus}</div></div>
      ${owing ? `<div><div class="k">${m.dueDate ? 'Due date' : 'Balance'}</div><div class="v">${m.dueDate ? escapeHtml(formatDueDate(m.dueDate)) : withCurrency(m.balanceDue)}</div></div>` : ''}
    </section>

    ${m.headerNote ? `<p class="note">${escapeHtml(m.headerNote)}</p>` : ''}

    <div class="spacer"></div>
    <footer class="foot">
      <div class="thanks">${escapeHtml(m.footerNote)} Please keep this receipt for returns and warranty claims.</div>
      <div class="brand">Powered by StockDesk · stockdeskinventory.com</div>
    </footer>
  </main>
</body>
</html>`;
}

export function buildReceiptHtml(sale, settings, cashierName, options = {}) {
  const paper = options.paper || getPrintSettings().paper;
  const model = receiptModel(sale, settings, cashierName);
  return paper === 'a4' ? buildA4Html(model) : buildThermalHtml(model, paper);
}

export default function PosReceipt({ sale, settings, cashierName, onClose, autoPrint = false }) {
  const frameRef = useRef(null);
  const printedRef = useRef(false);
  const [paper, setPaper] = useState(() => getPrintSettings().paper);
  const html = useMemo(() => (sale && settings ? buildReceiptHtml(sale, settings, cashierName, { paper }) : ''), [sale, settings, cashierName, paper]);

  if (!html) return null;

  const receiptNumber = sale.receipt?.receiptNumber || sale.id;
  const balanceDue = Number(sale.balanceDue || 0);
  const isA4 = paper === 'a4';

  const handlePrint = () => {
    // Print the preview frame itself: no pop-up window (often blocked on
    // phones) and identical output to what is shown on screen.
    const frameWindow = frameRef.current?.contentWindow;
    if (!frameWindow) return;
    frameWindow.focus();
    frameWindow.print();
  };

  const handleLoad = () => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (frame && doc?.body) {
      frame.style.height = `${doc.documentElement.scrollHeight}px`;
    }
    if (autoPrint && !printedRef.current) {
      printedRef.current = true;
      window.setTimeout(handlePrint, 150);
    }
  };

  const choosePaper = (value) => {
    setPaper(value);
    savePrintSettings({ paper: value });
  };

  return (
    <div className="app-overlay fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={`app-modal flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl border sm:rounded-2xl ${isA4 ? 'max-w-4xl' : 'max-w-md'}`}
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

        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-default)] px-5 py-2.5">
          <span className="text-xs text-[var(--text-muted)]">Paper</span>
          <div className="inline-flex rounded-lg border border-[var(--border-default)] bg-[var(--surface-secondary)] p-0.5 text-xs" role="radiogroup" aria-label="Paper size">
            {PAPER_SIZES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={paper === option.value}
                onClick={() => choosePaper(option.value)}
                className={`rounded-md px-2.5 py-1 font-medium ${paper === option.value ? 'bg-[var(--surface-primary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'}`}
              >
                {option.value === 'a4' ? 'A4' : option.value}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-[var(--surface-secondary)] px-4 py-5">
          <div className={`mx-auto w-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_24px_-8px_rgba(0,0,0,0.25)] ${isA4 ? 'max-w-[820px] rounded-md' : paper === '58mm' ? 'max-w-[230px] rounded-sm' : 'max-w-[320px] rounded-sm'}`}>
            <iframe
              key={paper}
              ref={frameRef}
              title={`Receipt ${receiptNumber}`}
              srcDoc={html}
              onLoad={handleLoad}
              className="block w-full border-0"
              style={{ height: isA4 ? 1100 : 560 }}
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
