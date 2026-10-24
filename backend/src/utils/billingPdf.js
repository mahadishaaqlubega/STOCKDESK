// StockDesk subscription documents as A4 PDFs: invoices (what a shop owes for
// its plan) and payment receipts (what it paid). Same look as shop receipts.

const PDFDocument = require('pdfkit');

const COLORS = {
  ink: '#111827',
  body: '#4B5563',
  label: '#6B7280',
  faint: '#9CA3AF',
  hairline: '#E5E7EB',
  panel: '#F6F7F9',
  accent: '#0D9488',
  ok: '#047857',
  due: '#B45309',
};

const SELLER = {
  name: 'StockDesk Inventory',
  lines: ['Kampala, Uganda', 'hello@stockdeskinventory.com', 'WhatsApp +256 742 226 839', 'www.stockdeskinventory.com'],
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/**
 * @param {object} o
 *   type        'invoice' | 'receipt'
 *   number      document number, e.g. INV-000012 / PAY-000034
 *   date        issue date
 *   shop        { name, owner, email, phone, location }
 *   items       [{ description, detail, quantity, unitPrice }]
 *   currency
 *   dueDate     invoice only
 *   payTo       invoice only: { mtnNumber, airtelNumber, accountName, instructions }
 *   payment     receipt only: { method, reference, paidOn, periodStart, periodEnd }
 * @returns {Promise<Buffer>}
 */
function generateBillingPdf(o) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `${o.type === 'invoice' ? 'Invoice' : 'Payment receipt'} ${o.number}`, Producer: 'StockDesk' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const currency = o.currency || 'UGX';
    const money = (n) => `${currency} ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
    const margin = 50;
    const right = doc.page.width - margin;
    const width = right - margin;
    // Statements (a shop's customer balance) reuse the invoice layout with the
    // shop as the seller.
    const isStatement = o.type === 'statement';
    const isInvoice = o.type === 'invoice' || isStatement;
    const title = isStatement ? 'Statement' : isInvoice ? 'Invoice' : 'Payment receipt';
    const seller = o.seller || SELLER;
    let y = margin;

    const rule = (top) => doc.moveTo(margin, top).lineTo(right, top).lineWidth(0.7).strokeColor(COLORS.hairline).stroke();
    const label = (text, x, top, opts = {}) => doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.label).text(text.toUpperCase(), x, top, { characterSpacing: 1.2, lineBreak: false, ...opts });

    // Header: seller (left), document (right)
    doc.font('Helvetica-Bold').fontSize(19).fillColor(COLORS.accent).text(seller.name, margin, y, { width: 300 });
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.body);
    (seller.lines || []).filter(Boolean).forEach((line) => doc.text(line, margin, doc.y + 1, { width: 300 }));
    const leftBottom = doc.y;

    doc.font('Helvetica').fontSize(24).fillColor(COLORS.ink).text(title, right - 260, y, { width: 260, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLORS.ink).text(o.number, right - 260, y + 34, { width: 260, align: 'right' });
    doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.body).text(`Issued ${fmtDate(o.date)}`, right - 260, doc.y + 2, { width: 260, align: 'right' });
    if (isInvoice && o.dueDate) doc.text(`Due ${fmtDate(o.dueDate)}`, right - 260, doc.y + 2, { width: 260, align: 'right' });
    // Status pill
    const status = isStatement ? 'BALANCE DUE' : isInvoice ? 'UNPAID' : 'PAID';
    const statusColor = isInvoice ? COLORS.due : COLORS.ok;
    const pillY = doc.y + 8;
    const pillW = doc.font('Helvetica-Bold').fontSize(9).widthOfString(status) + 18;
    doc.roundedRect(right - pillW, pillY, pillW, 18, 9).fillColor(isInvoice ? '#FEF3C7' : '#D1FAE5').fill();
    doc.fillColor(statusColor).text(status, right - pillW, pillY + 5, { width: pillW, align: 'center', characterSpacing: 1 });
    y = Math.max(leftBottom, pillY + 18) + 24;
    rule(y);
    y += 20;

    // Billed to
    label(isStatement ? 'Customer' : isInvoice ? 'Bill to' : 'Received from', margin, y);
    label(isStatement ? 'Summary' : isInvoice ? 'Plan' : 'Payment', margin + width / 2, y);
    y += 16;
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor(COLORS.ink).text(o.shop.name, margin, y, { width: width / 2 - 10 });
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.body);
    [o.shop.owner, o.shop.email, o.shop.phone, o.shop.location].filter(Boolean).forEach((line) => doc.text(line, margin, doc.y + 1, { width: width / 2 - 10 }));
    const billBottom = doc.y;
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.body);
    const infoX = margin + width / 2;
    const info = isStatement
      ? [`${o.items.length} unpaid sale${o.items.length === 1 ? '' : 's'}`, o.summary || null]
      : isInvoice
      ? [o.items[0]?.description, o.items[0]?.detail]
      : [`${o.payment?.method || ''}${o.payment?.reference ? ` · ${o.payment.reference}` : ''}`, o.payment?.paidOn ? `Paid ${fmtDate(o.payment.paidOn)}` : null, o.payment?.periodEnd ? `Covers ${fmtDate(o.payment.periodStart)} to ${fmtDate(o.payment.periodEnd)}` : null];
    let iy = y;
    info.filter(Boolean).forEach((line, i) => {
      doc.font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fillColor(i === 0 ? COLORS.ink : COLORS.body).text(line, infoX, iy, { width: width / 2 });
      iy = doc.y + 1;
    });
    y = Math.max(billBottom, iy) + 24;
    rule(y);
    y += 16;

    // Items
    const qtyRight = right - 200;
    const priceRight = right - 100;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#374151');
    doc.text('DESCRIPTION', margin, y, { characterSpacing: 0.6, lineBreak: false });
    if (!isStatement) {
      doc.text('QTY', qtyRight - 40, y, { width: 40, align: 'right', characterSpacing: 0.6 });
      doc.text('PRICE', priceRight - 90, y, { width: 90, align: 'right', characterSpacing: 0.6 });
    }
    doc.text(isStatement ? 'BALANCE' : 'AMOUNT', right - 90, y, { width: 90, align: 'right', characterSpacing: 0.6 });
    y += 18;
    rule(y);
    let total = 0;
    for (const item of o.items) {
      y += 12;
      const amount = Number(item.quantity) * Number(item.unitPrice);
      total += amount;
      doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.ink).text(item.description, margin, y, { width: qtyRight - margin - 50 });
      if (item.detail) doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.label).text(item.detail, margin, doc.y + 2, { width: qtyRight - margin - 50 });
      const rowBottom = doc.y;
      doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.ink);
      if (!isStatement) {
        doc.text(String(item.quantity), qtyRight - 40, y, { width: 40, align: 'right' });
        doc.text(money(item.unitPrice), priceRight - 90, y, { width: 90, align: 'right' });
      }
      doc.text(money(amount), right - 90, y, { width: 90, align: 'right' });
      y = Math.max(rowBottom, y + 14) + 12;
      rule(y);
    }
    if (o.amount != null) total = Number(o.amount);

    // Total
    y += 14;
    doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.ink).text(isStatement ? 'Total owed' : isInvoice ? 'Amount due' : 'Amount paid', right - 260, y, { width: 150 });
    doc.text(money(total), right - 160, y, { width: 160, align: 'right' });
    y += 34;

    // Payment instructions (invoice) or thank-you (receipt)
    const panelTop = y;
    const lines = [];
    if (isStatement) {
      lines.push(...(o.panelLines || ['Please pay at the shop at your earliest convenience. Thank you!']));
    } else if (isInvoice) {
      const p = o.payTo || {};
      if (p.mtnNumber) lines.push(`MTN Mobile Money: ${p.mtnNumber}`);
      if (p.airtelNumber) lines.push(`Airtel Money: ${p.airtelNumber}`);
      if (p.accountName) lines.push(`Registered name: ${p.accountName}`);
      lines.push(p.instructions || 'After paying, enter the transaction ID on the Billing page in StockDesk so we can confirm it.');
    } else {
      lines.push('Thank you for your payment. This receipt confirms we received it.');
      lines.push('Questions about your account? Email hello@stockdeskinventory.com or WhatsApp +256 742 226 839.');
    }
    doc.font('Helvetica').fontSize(10);
    const textHeight = lines.reduce((h, l) => h + doc.heightOfString(l, { width: width - 32 }) + 4, 0);
    doc.roundedRect(margin, panelTop, width, textHeight + 38, 10).fillColor(COLORS.panel).fill();
    label(isStatement ? 'Paying' : isInvoice ? 'How to pay' : 'Thank you', margin + 16, panelTop + 14);
    let ly = panelTop + 30;
    lines.forEach((l, i) => {
      doc.font(isInvoice && !isStatement && i < lines.length - 1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(COLORS.ink).text(l, margin + 16, ly, { width: width - 32 });
      ly = doc.y + 4;
    });

    // Footer
    const footY = doc.page.height - margin - 20;
    doc.moveTo(margin, footY - 12).lineTo(right, footY - 12).lineWidth(0.7).strokeColor(COLORS.hairline).stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.faint).text(o.seller ? `${seller.name} · ${title} ${o.number} · Powered by StockDesk` : `${SELLER.name} · ${title} ${o.number} · stockdeskinventory.com`, margin, footY, { width, align: 'center' });

    doc.end();
  });
}

module.exports = { generateBillingPdf };
