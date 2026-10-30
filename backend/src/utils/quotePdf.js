// Quotations and proforma invoices as A4 PDFs, in the same style as the
// shop's other documents. The total carries a brass double rule, the mark a
// stock book uses for a final figure.

const PDFDocument = require('pdfkit');
const { loadShopLogo } = require('./receiptGenerator');

const COLORS = {
  ink: '#111814',
  body: '#434C46',
  label: '#6B746D',
  faint: '#9AA39C',
  hairline: '#E4E2DA',
  panel: '#F5F4EF',
  accent: '#14532D',
  brass: '#A8843F',
};

// Currencies written without cents (same list as the app's formatter).
const ZERO_DECIMAL = new Set(['UGX', 'RWF', 'BIF', 'GNF', 'KMF', 'DJF', 'XOF', 'XAF', 'XPF', 'JPY', 'KRW', 'VND', 'CLP', 'PYG', 'ISK', 'VUV']);

// Date-only values ("2026-11-13") are read at midday so no time zone moves
// them to the day before; timestamps are used as they are.
const fmtDate = (d) => {
  if (!d) return '';
  const date = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`) : new Date(d);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

function quoteNumber(q) {
  return `${q.docType === 'proforma' ? 'PF' : 'QT'}-${String(q.number).padStart(5, '0')}`;
}

/**
 * @param {object} quote     Quotation row (plain object)
 * @param {object} settings  Setting row with `shop` included
 * @returns {Promise<Buffer>}
 */
async function generateQuotePdf(quote, settings) {
  const logo = settings?.shopLogoUrl ? await loadShopLogo(settings.shopLogoUrl).catch(() => null) : null;
  const isProforma = quote.docType === 'proforma';
  const title = isProforma ? 'Proforma invoice' : 'Quotation';
  const number = quoteNumber(quote);
  const currency = quote.currency || settings?.currency || 'UGX';
  const decimals = ZERO_DECIMAL.has(String(currency).toUpperCase()) ? 0 : 2;
  const money = (n) => `${currency} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  const shopName = settings?.shop?.name || settings?.shopName || 'Shop';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, info: { Title: `${title} ${number}`, Producer: 'StockDesk' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin = 50;
    const right = doc.page.width - margin;
    const width = right - margin;
    const bottomLimit = doc.page.height - margin - 60;
    const rule = (top) => doc.moveTo(margin, top).lineTo(right, top).lineWidth(0.7).strokeColor(COLORS.hairline).stroke();
    const label = (text, x, top, opts = {}) => doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.label).text(text.toUpperCase(), x, top, { characterSpacing: 1.2, lineBreak: false, ...opts });
    let y = margin;

    // Header: shop (left), document (right)
    let textX = margin;
    if (logo) {
      try {
        doc.image(logo, margin, y, { fit: [54, 54] });
        textX = margin + 66;
      } catch {
        textX = margin;
      }
    }
    doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.accent).text(shopName, textX, y, { width: 280 });
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.body);
    [settings?.address, settings?.phone].filter(Boolean).forEach((line) => doc.text(line, textX, doc.y + 1, { width: 280 }));
    const leftBottom = Math.max(doc.y, logo ? y + 54 : 0);

    doc.font('Helvetica').fontSize(23).fillColor(COLORS.ink).text(title, right - 240, y, { width: 240, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLORS.ink).text(number, right - 240, y + 33, { width: 240, align: 'right' });
    doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.body).text(`Issued ${fmtDate(quote.createdAt)}`, right - 240, doc.y + 2, { width: 240, align: 'right' });
    doc.font('Helvetica-Bold').fillColor(COLORS.brass).text(`Valid until ${fmtDate(quote.validUntil)}`, right - 240, doc.y + 2, { width: 240, align: 'right' });
    y = Math.max(leftBottom, doc.y) + 24;
    rule(y);
    y += 20;

    // Prepared for
    label('Prepared for', margin, y);
    y += 16;
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor(COLORS.ink).text(quote.billToName, margin, y, { width: width / 2 });
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.body);
    [quote.billToAddress, quote.billToPhone, quote.billToEmail].filter(Boolean).forEach((line) => doc.text(line, margin, doc.y + 1, { width: width / 2 }));
    y = doc.y + 24;
    rule(y);
    y += 16;

    // Items
    const qtyRight = right - 200;
    const priceRight = right - 100;
    const header = (top) => {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#3A433D');
      doc.text('DESCRIPTION', margin, top, { characterSpacing: 0.6, lineBreak: false });
      doc.text('QTY', qtyRight - 40, top, { width: 40, align: 'right', characterSpacing: 0.6 });
      doc.text('PRICE', priceRight - 90, top, { width: 90, align: 'right', characterSpacing: 0.6 });
      doc.text('AMOUNT', right - 90, top, { width: 90, align: 'right', characterSpacing: 0.6 });
      rule(top + 18);
      return top + 18;
    };
    y = header(y);
    for (const item of quote.items || []) {
      const descHeight = doc.font('Helvetica').fontSize(10.5).heightOfString(item.name, { width: qtyRight - margin - 50 });
      if (y + 12 + descHeight + 12 > bottomLimit) {
        doc.addPage();
        y = header(margin);
      }
      y += 12;
      doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.ink).text(item.name, margin, y, { width: qtyRight - margin - 50 });
      const rowBottom = doc.y;
      doc.text(String(Number(item.quantity)), qtyRight - 40, y, { width: 40, align: 'right' });
      doc.text(money(item.price), priceRight - 110, y, { width: 110, align: 'right' });
      doc.text(money(item.lineTotal), right - 110, y, { width: 110, align: 'right' });
      y = Math.max(rowBottom, y + 14) + 12;
      rule(y);
    }

    // Totals
    if (y + 130 > bottomLimit) {
      doc.addPage();
      y = margin;
    }
    y += 14;
    const totalsX = right - 260;
    const line = (name, value, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 13 : 10.5).fillColor(bold ? COLORS.ink : COLORS.body);
      doc.text(name, totalsX, y, { width: 150 });
      doc.text(value, right - 160, y, { width: 160, align: 'right' });
      y += bold ? 22 : 18;
    };
    line('Subtotal', money(quote.subtotal));
    // Plain hyphen: the built-in PDF font has no minus sign.
    if (Number(quote.discount) > 0) line('Discount', `- ${money(quote.discount)}`);
    if (Number(quote.taxAmount) > 0) line(`VAT ${Number(quote.taxRate)}%`, money(quote.taxAmount));
    y += 4;
    line('Total', money(quote.total), true);
    // Double rule under the total figure.
    doc.moveTo(right - 120, y - 3).lineTo(right, y - 3).lineWidth(0.9).strokeColor(COLORS.brass).stroke();
    doc.moveTo(right - 120, y).lineTo(right, y).lineWidth(0.9).strokeColor(COLORS.brass).stroke();
    y += 26;

    // Notes and terms
    const lines = [];
    if (quote.notes) lines.push(quote.notes);
    lines.push(isProforma
      ? `This proforma invoice is not a receipt. Prices are held until ${fmtDate(quote.validUntil)}; goods are supplied once payment is received.`
      : `Prices are held until ${fmtDate(quote.validUntil)}. Stock is not reserved until you confirm.`);
    doc.font('Helvetica').fontSize(10);
    const textHeight = lines.reduce((h, l) => h + doc.heightOfString(l, { width: width - 32 }) + 4, 0);
    if (y + textHeight + 38 > bottomLimit) {
      doc.addPage();
      y = margin;
    }
    doc.roundedRect(margin, y, width, textHeight + 38, 10).fillColor(COLORS.panel).fill();
    label('Notes', margin + 16, y + 14);
    let ly = y + 30;
    lines.forEach((l) => {
      doc.font('Helvetica').fontSize(10).fillColor(COLORS.ink).text(l, margin + 16, ly, { width: width - 32 });
      ly = doc.y + 4;
    });

    // Footer on every page
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const footY = doc.page.height - margin - 20;
      doc.moveTo(margin, footY - 12).lineTo(right, footY - 12).lineWidth(0.7).strokeColor(COLORS.hairline).stroke();
      doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.faint)
        .text(`${shopName} · ${title} ${number}${range.count > 1 ? ` · Page ${i - range.start + 1} of ${range.count}` : ''} · Made with StockDesk`, margin, footY, { width, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}

module.exports = { generateQuotePdf, quoteNumber };
