import { useEffect, useState } from 'react';

/**
 * POS Receipt Component
 * Fast, on-screen receipt optimized for thermal printing
 * Simple layout with monospace font, 80mm width simulation
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoneyValue(value) {
  return Number.parseFloat(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMoney(currency, value) {
  return `${currency} ${formatMoneyValue(value)}`;
}

export default function PosReceipt({ sale, settings, cashierName, onClose }) {
  const [receiptData, setReceiptData] = useState(null);
  const shopName = settings?.shop?.name || settings?.shopName || 'StockDesk';
  const shopSlug = settings?.shop?.slug || `shop-${settings?.shopId || 'legacy'}`;

  useEffect(() => {
    if (!sale || !settings) return;

    // Calculate values
    let subtotal = 0;
    sale.items.forEach((item) => {
      subtotal += parseFloat(item.price) * item.quantity;
    });

    const vatRate = parseFloat(settings.vat || 0) / 100;
    const vatAmount = (sale.total * vatRate / (1 + vatRate)).toFixed(2);

    setReceiptData({
      subtotal: subtotal,
      discount: parseFloat(sale.discount || 0),
      total: parseFloat(sale.total),
      vat: Number(vatAmount),
      vatPercent: settings.vat || 0,
      currency: sale.currency || settings.currency || 'UGX',
    });
  }, [sale, settings]);

  const handlePrint = () => {
    if (!receiptData) {
      return;
    }

    const receiptNumber = sale.receipt?.receiptNumber || sale.id;
    const createdAt = new Date(sale.createdAt).toLocaleString();
    const itemsHtml = sale.items
      .map((item) => {
        const lineTotal = (parseFloat(item.price) * item.quantity).toFixed(2);
        return `
          <div class="item-row">
            <div class="item-head">
              <span class="qty">${escapeHtml(item.quantity)}</span>
              <span class="desc">${escapeHtml(item.Product?.name || item.name || 'Item')}</span>
              <span class="amount">${escapeHtml(formatMoney(receiptData.currency, lineTotal))}</span>
            </div>
            <div class="item-sub">@ ${escapeHtml(formatMoney(receiptData.currency, item.price))} ea</div>
          </div>
        `;
      })
      .join('');

    const hasDiscount = parseFloat(sale.discount || 0) > 0;
    const hasVat = parseFloat(settings.vat || 0) > 0;
    const discountRow = `<div class="summary-row ${hasDiscount ? 'discount' : 'muted-row'}"><span>Discount</span><span>${hasDiscount ? '- ' : ''}${escapeHtml(formatMoney(receiptData.currency, receiptData.discount))}</span></div>`;
    const vatRow = `<div class="summary-row ${hasVat ? '' : 'muted-row'}"><span>VAT @ ${escapeHtml(settings.vat || 0)}%</span><span>${escapeHtml(formatMoney(receiptData.currency, receiptData.vat))}</span></div>`;
    const footerText = settings.receiptFooter ? `<p class="footer-note">${escapeHtml(settings.receiptFooter)}</p>` : '';

    const printWindow = window.open('', '_blank', 'width=420,height=760');
    if (!printWindow) {
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt ${escapeHtml(receiptNumber)}</title>
          <meta charset="utf-8" />
          <style>
            :root {
              color-scheme: light;
            }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              font-family: 'Segoe UI', Arial, sans-serif;
              background: #ffffff;
              color: #0f172a;
            }
            .sheet {
              width: 80mm;
              margin: 0 auto;
              padding: 10mm 7mm 12mm;
            }
            .header, .shop, .payment, .footer {
              text-align: center;
            }
            .title {
              font-size: 20px;
              font-weight: 700;
              letter-spacing: 0.08em;
              margin: 0;
            }
            .muted {
              color: #64748b;
              font-size: 11px;
              margin-top: 4px;
            }
            .divider {
              border-top: 1px dashed #cbd5e1;
              margin: 12px 0;
            }
            .shop-name {
              font-size: 14px;
              font-weight: 700;
            }
            .table-head, .item-head, .summary-row, .total-row {
              display: grid;
              grid-template-columns: 34px 1fr auto;
              gap: 8px;
              align-items: start;
            }
            .table-head {
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              color: #334155;
              margin-bottom: 8px;
            }
            .item-row {
              margin-bottom: 10px;
              font-size: 11px;
            }
            .qty { font-weight: 700; }
            .amount, .money {
              text-align: right;
              font-weight: 700;
              font-variant-numeric: tabular-nums;
              font-feature-settings: 'tnum' 1;
              font-family: 'Consolas', 'SFMono-Regular', 'Liberation Mono', monospace;
            }
            .item-sub {
              padding-left: 42px;
              font-size: 10px;
              color: #64748b;
              margin-top: 2px;
              font-variant-numeric: tabular-nums;
            }
            .summary-card {
              border: 1px solid #dbe4ea;
              border-radius: 16px;
              background: linear-gradient(180deg, #ffffff 0%, #f8fbfc 100%);
              padding: 14px;
              box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05);
            }
            .summary-title {
              margin: 0 0 10px;
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.18em;
              color: #64748b;
            }
            .summary-row {
              grid-template-columns: 1fr auto;
              font-size: 12px;
              margin: 0;
              padding: 8px 0;
              border-bottom: 1px solid #e2e8f0;
            }
            .summary-row span:last-child {
              font-variant-numeric: tabular-nums;
              font-feature-settings: 'tnum' 1;
              font-family: 'Consolas', 'SFMono-Regular', 'Liberation Mono', monospace;
              font-weight: 700;
            }
            .discount { color: #b91c1c; }
            .muted-row { color: #94a3b8; }
            .total-row {
              grid-template-columns: 1fr auto;
              font-size: 18px;
              font-weight: 800;
              margin-top: 10px;
              padding: 12px 14px;
              border-radius: 14px;
              background: #0f766e;
              color: white;
            }
            .footer {
              margin-top: 14px;
              font-size: 11px;
            }
            .footer-title {
              font-size: 16px;
              font-weight: 800;
              margin: 0 0 6px;
            }
            .footer-note {
              color: #64748b;
              margin: 0;
            }
            @media print {
              body { margin: 0; }
              .sheet { margin: 0 auto; }
            }
          </style>
        </head>
        <body>
          <main class="sheet">
            <section class="header">
              <h1 class="title">RECEIPT</h1>
              <div class="muted">#${escapeHtml(receiptNumber)}</div>
              <div class="muted">${escapeHtml(createdAt)}</div>
            </section>

            <div class="divider"></div>

            <section class="shop">
              <div class="shop-name">${escapeHtml(shopName)}</div>
              <div class="muted">Tenant: ${escapeHtml(shopSlug)}</div>
              <div class="muted">${escapeHtml(settings.address || '')}</div>
              ${settings.phone ? `<div class="muted">${escapeHtml(settings.phone)}</div>` : ''}
            </section>

            <div class="divider"></div>

            <section>
              <div class="table-head">
                <span>Qty</span>
                <span>Description</span>
                <span>Amount</span>
              </div>
              ${itemsHtml}
            </section>

            <div class="divider"></div>

            <section class="summary-card">
              <p class="summary-title">Receipt Summary</p>
              <div class="summary-row"><span>Subtotal</span><span class="money">${escapeHtml(formatMoney(receiptData.currency, receiptData.subtotal))}</span></div>
              ${discountRow}
              ${vatRow}
              <div class="total-row"><span>TOTAL</span><span class="money">${escapeHtml(formatMoney(receiptData.currency, receiptData.total))}</span></div>
            </section>

            <div class="divider"></div>

            <section class="payment">
              <div class="muted">Payment: ${escapeHtml(sale.paymentMethod)}</div>
              <div class="muted">Cashier: ${escapeHtml(cashierName)}</div>
            </section>

            <div class="divider"></div>

            <section class="footer">
              <p class="footer-title">Thank you!</p>
              ${footerText}
            </section>
          </main>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      printWindow.print();
      printWindow.onafterprint = () => printWindow.close();
    };
  };

  if (!receiptData) return null;

  const saleDate = new Date(sale.createdAt);
  const receiptNumber = sale.receipt?.receiptNumber || sale.id;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-3 sm:items-center sm:p-4 no-print" onClick={onClose}>
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="overflow-y-auto px-5 py-5 sm:px-7 sm:py-7 print:p-0 print:rounded-none print:shadow-none print:max-w-none">
          {/* Receipt Header */}
          <div className="mb-5 rounded-[24px] bg-[#1f7a8c] px-5 py-5 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/70">Sales Receipt</p>
                <h2 className="mt-2 text-3xl font-bold">{shopName}</h2>
                <div className="mt-3 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85">
                  {shopSlug}
                </div>
                <p className="mt-2 text-sm text-white/80">{settings.address || 'Store Address'}</p>
                {settings.phone && <p className="text-sm text-white/80">{settings.phone}</p>}
              </div>
              {settings.shopLogoUrl ? (
                <img src={settings.shopLogoUrl} alt="Shop logo" className="h-14 w-14 rounded-2xl bg-white/10 object-cover p-1" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/30 text-xl font-bold">SD</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-b border-slate-200 pb-5 text-sm sm:grid-cols-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Receipt</p>
              <p className="mt-1 font-semibold text-slate-900">#{receiptNumber}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Date</p>
              <p className="mt-1 font-semibold text-slate-900">{saleDate.toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Time</p>
              <p className="mt-1 font-semibold text-slate-900">{saleDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Cashier</p>
              <p className="mt-1 font-semibold text-slate-900">{cashierName}</p>
            </div>
          </div>

          {/* Items */}
          <div className="mb-5 mt-5 rounded-[22px] border border-slate-200 bg-slate-50/60 p-4">
            <div className="grid grid-cols-[40px_1fr_88px] gap-2 border-b border-slate-200 pb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              <span>Qty</span>
              <span>Description</span>
              <span className="text-right">Amount</span>
            </div>

            {sale.items.map((item, index) => (
              <div key={index} className="border-b border-slate-200/80 py-3 last:border-b-0 last:pb-0">
                <div className="grid grid-cols-[40px_1fr_88px] gap-2 text-sm text-slate-800">
                  <span className="font-semibold">{item.quantity}</span>
                  <span className="pr-2 font-medium">{item.Product?.name}</span>
                  <span className="text-right font-semibold font-mono tabular-nums">
                    {formatMoney(receiptData.currency, parseFloat(item.price) * item.quantity)}
                  </span>
                </div>
                <div className="pl-[48px] pt-1 text-xs text-slate-500 font-mono tabular-nums">
                  @ {formatMoney(receiptData.currency, item.price)} ea
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
            <div className="rounded-[22px] border border-slate-200 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Payment</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{sale.paymentMethod}</p>
              {settings.receiptHeader && <p className="mt-4 text-xs leading-5 text-slate-500">{settings.receiptHeader}</p>}
              {settings.receiptFooter && <p className="mt-3 text-xs leading-5 text-slate-500">{settings.receiptFooter}</p>}
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Summary</p>
              <div className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex justify-between px-4 py-3 text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-semibold text-slate-900 font-mono tabular-nums">
                    {formatMoney(receiptData.currency, receiptData.subtotal)}
                  </span>
                </div>

                <div className={`flex justify-between px-4 py-3 text-sm ${parseFloat(sale.discount) > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                  <span>Discount</span>
                  <span className="font-semibold font-mono tabular-nums">
                    {parseFloat(sale.discount) > 0 ? '- ' : ''}{formatMoney(receiptData.currency, receiptData.discount)}
                  </span>
                </div>

                <div className={`flex justify-between px-4 py-3 text-sm ${parseFloat(settings.vat) > 0 ? 'text-slate-600' : 'text-slate-400'}`}>
                  <span>VAT @ {settings.vat || 0}%</span>
                  <span className="font-semibold text-slate-900 font-mono tabular-nums">
                    {formatMoney(receiptData.currency, receiptData.vat)}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex justify-between rounded-2xl bg-[#0f766e] px-4 py-4 text-lg font-bold text-white shadow-sm">
                <span>TOTAL</span>
                <span className="font-mono tabular-nums">
                  {formatMoney(receiptData.currency, receiptData.total)}
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-5 text-center text-sm mb-6 border-t border-slate-200 pt-5">
            <p className="text-slate-800 text-lg font-bold">Thank you!</p>
            <p className="mt-1 text-xs text-slate-500">Please keep this receipt for your records.</p>
          </div>

        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-7 no-print">
          <button
            onClick={onClose}
            className="rounded-2xl bg-slate-200 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-300"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Print Receipt
          </button>
        </div>

        {/* Print Styles */}
        <style>{`
          @media print {
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              margin: 0;
              padding: 0;
              background: white;
            }
            .no-print {
              display: none !important;
            }
            .print\\:p-0 {
              padding: 0;
            }
            .print\\:rounded-none {
              border-radius: 0;
            }
            .fixed {
              position: static;
              inset: auto;
              background: white;
            }
            .bg-black\\/50 {
              background: white;
            }
            .rounded-lg {
              border-radius: 0;
            }
            .shadow-xl {
              box-shadow: none;
            }
            .w-full {
              width: 80mm;
              margin: 0 auto;
            }
            .sticky {
              position: static;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
