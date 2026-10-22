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
  const items = (sale.items || []).map((item) => ({
    name: (item.Product?.name || item.name || '').trim() || 'Item',
    quantity: Number(item.quantity || 0),
    price: Number(item.price || 0),
  }));
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
          <div class="row sub"><span>${item.quantity} × ${m.money(item.price)}</span><span class="n">${m.money(item.price * item.quantity)}</span></div>
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
      ${row(`Subtotal (${m.units} item${m.units === 1 ? '' : 's'})`, m.money(m.subtotal))}
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

function buildA4Html(m) {
  const status = m.isCredit && m.balanceDue > 0
    ? `<span class="stamp due">Balance due</span>`
    : `<span class="stamp paid">Paid</span>`;

  const paymentLines = m.isCredit
    ? [`Credit sale`, m.dueDate ? `Due ${escapeHtml(formatDueDate(m.dueDate))}` : null]
    : m.paymentMethod === 'Split' && m.splits.length
      ? m.splits.map((s) => `${escapeHtml(s.method)} · ${m.money(s.amount)}`)
      : [escapeHtml(m.paymentMethod)];

  const rows = m.items
    .map((item, index) => `
      <tr>
        <td class="idx">${index + 1}</td>
        <td class="desc">${escapeHtml(item.name)}</td>
        <td class="num">${item.quantity}</td>
        <td class="num muted">${m.money(item.price)}</td>
        <td class="num strong">${m.money(item.price * item.quantity)}</td>
      </tr>`)
    .join('');

  const totalRow = (label, value, cls = '') => `<div class="t-row ${cls}"><span>${label}</span><span>${value}</span></div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt ${escapeHtml(m.receiptNumber)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #0f172a; }
  body { font-family: 'Inter', 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { position: relative; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 0 0 28mm; background: #fff; }
  .band { height: 8px; background: linear-gradient(90deg, #0d9488, #14b8a6 60%, #5eead4); }
  .inner { padding: 14mm 16mm 0; }
  .head { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
  .brand { display: flex; gap: 14px; align-items: center; min-width: 0; }
  .logo { width: 60px; height: 60px; object-fit: contain; border-radius: 10px; }
  .mono { width: 56px; height: 56px; border-radius: 14px; background: #0d9488; color: #fff; font-weight: 700; font-size: 24px; display: flex; align-items: center; justify-content: center; }
  .shop { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
  .contact { color: #64748b; font-size: 12px; margin-top: 2px; }
  .doc { text-align: right; }
  .eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #0d9488; }
  .number { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .date { color: #64748b; font-size: 12px; }
  .stamp { display: inline-block; margin-top: 10px; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  .stamp.paid { background: #dcfce7; color: #15803d; }
  .stamp.due { background: #fef3c7; color: #b45309; }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 26px; }
  .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; }
  .label { font-size: 10.5px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #94a3b8; }
  .value { font-size: 14px; font-weight: 600; margin-top: 4px; }
  .value small { display: block; font-size: 12px; font-weight: 400; color: #64748b; margin-top: 1px; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 26px; }
  thead th { background: #0f172a; color: #fff; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; padding: 10px 12px; text-align: left; }
  thead th:first-child { border-radius: 10px 0 0 10px; }
  thead th:last-child { border-radius: 0 10px 10px 0; }
  thead th.num { text-align: right; }
  tbody td { padding: 11px 12px; border-bottom: 1px solid #eef2f6; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #fafbfc; }
  .idx { width: 32px; color: #94a3b8; }
  .desc { font-weight: 500; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .muted { color: #64748b; }
  .strong { font-weight: 600; }
  .bottom { display: grid; grid-template-columns: 1fr 300px; gap: 28px; margin-top: 22px; align-items: start; }
  .notes p { margin: 4px 0 0; color: #475569; font-size: 12px; }
  .totals { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
  .t-row { display: flex; justify-content: space-between; padding: 9px 16px; font-variant-numeric: tabular-nums; }
  .t-row span:first-child { color: #64748b; }
  .t-row.grand { background: #0d9488; color: #fff; font-size: 17px; font-weight: 700; padding: 13px 16px; }
  .t-row.grand span:first-child { color: #ccfbf1; }
  .t-row.paid span:last-child { font-weight: 600; }
  .t-row.owe { background: #fffbeb; color: #b45309; font-weight: 700; }
  .t-row.owe span:first-child { color: #b45309; }
  .foot { position: absolute; left: 16mm; right: 16mm; bottom: 12mm; border-top: 1px solid #e2e8f0; padding-top: 12px; display: flex; justify-content: space-between; gap: 16px; font-size: 11.5px; color: #64748b; }
  .foot strong { color: #0f172a; font-size: 13px; }
  @media screen and (min-width: 641px) and (max-width: 800px) { .page { zoom: 0.9; } }
  @media screen and (max-width: 640px) { .page { width: 100%; min-height: 0; padding-bottom: 90px; } .inner { padding: 20px 18px 0; } .cards { grid-template-columns: 1fr; } .bottom { grid-template-columns: 1fr; } .head { flex-direction: column; } .doc { text-align: left; } .foot { left: 18px; right: 18px; bottom: 18px; flex-direction: column; } }
</style>
</head>
<body>
  <main class="page">
    <div class="band"></div>
    <div class="inner">
      <header class="head">
        <div class="brand">
          ${m.logo ? `<img class="logo" src="${escapeHtml(m.logo)}" alt="" />` : `<div class="mono">${escapeHtml(m.shopName.slice(0, 1).toUpperCase())}</div>`}
          <div style="min-width:0">
            <div class="shop">${escapeHtml(m.shopName)}</div>
            ${m.address ? `<div class="contact">${escapeHtml(m.address)}</div>` : ''}
            ${m.phone ? `<div class="contact">Tel ${escapeHtml(m.phone)}</div>` : ''}
          </div>
        </div>
        <div class="doc">
          <div class="eyebrow">Receipt</div>
          <div class="number">${escapeHtml(m.receiptNumber)}</div>
          <div class="date">${escapeHtml(m.createdAt.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }))} · ${escapeHtml(m.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</div>
          ${status}
        </div>
      </header>

      <section class="cards">
        <div class="card">
          <div class="label">Billed to</div>
          <div class="value">${escapeHtml(m.customer ? m.customer.name : 'Walk-in customer')}${m.customer?.phone ? `<small>${escapeHtml(m.customer.phone)}</small>` : ''}</div>
        </div>
        <div class="card">
          <div class="label">Served by</div>
          <div class="value">${escapeHtml(m.cashier)}<small>${m.units} item${m.units === 1 ? '' : 's'}</small></div>
        </div>
        <div class="card">
          <div class="label">Payment</div>
          <div class="value">${paymentLines.filter(Boolean).map((line, i) => (i ? `<small>${line}</small>` : line)).join('')}</div>
        </div>
      </section>

      <table>
        <thead>
          <tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount (${escapeHtml(m.currency)})</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <section class="bottom">
        <div class="notes">
          ${m.headerNote ? `<div class="label">Note</div><p>${escapeHtml(m.headerNote)}</p>` : ''}
          <div class="label" style="margin-top:${m.headerNote ? 14 : 0}px">Returns</div>
          <p>Please keep this receipt for returns and warranty claims.</p>
        </div>
        <div class="totals">
          ${totalRow('Subtotal', m.money(m.subtotal))}
          ${m.discount > 0 ? totalRow('Discount', `−${m.money(m.discount)}`) : ''}
          ${m.taxAmount > 0 ? totalRow(`VAT ${m.taxRate}%`, m.money(m.taxAmount)) : ''}
          ${totalRow('Total', `${escapeHtml(m.currency)} ${m.money(m.total)}`, 'grand')}
          ${m.isCredit ? totalRow('Paid', m.money(m.paid), 'paid') + totalRow('Balance due', `${escapeHtml(m.currency)} ${m.money(m.balanceDue)}`, 'owe') : ''}
        </div>
      </section>
    </div>

    <footer class="foot">
      <span><strong>${escapeHtml(m.footerNote)}</strong></span>
      <span>${escapeHtml([m.shopName, m.phone].filter(Boolean).join(' · '))} · Powered by StockDesk · stockdeskinventory.com</span>
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
