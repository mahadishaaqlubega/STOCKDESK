const PDFDocument = require('pdfkit');
const { fetchRemoteImage } = require('./remoteImage');

// Currencies written without a minor unit (ISO 4217 exponent 0), e.g. UGX.
const ZERO_DECIMAL_CURRENCIES = new Set([
  'UGX', 'RWF', 'BIF', 'GNF', 'KMF', 'DJF', 'XOF', 'XAF', 'XPF',
  'JPY', 'KRW', 'VND', 'CLP', 'PYG', 'ISK', 'VUV',
]);

// Palette shared with the on-screen A4 receipt: near-black text, grey
// secondary text, hairline rules and one soft panel.
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

async function loadRemoteImageBuffer(url) {
  if (!url) {
    return null;
  }
  // Uploaded logos are stored inline as data: URLs.
  const dataMatch = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(url);
  if (dataMatch) {
    // PDFKit renders PNG and JPEG only.
    return dataMatch[1] === 'webp' ? null : Buffer.from(dataMatch[2], 'base64');
  }
  return fetchRemoteImage(url);
}

function formatDate(value, options) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleDateString('en-GB', options);
}

exports.generateReceiptPdf = async (stream, sale, settings) => {
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, info: { Title: 'Receipt', Producer: 'StockDesk' } });
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;
  const right = pageWidth - margin;

  const currency = sale.currency || settings.currency || 'USD';
  const decimals = ZERO_DECIMAL_CURRENCIES.has(String(currency).toUpperCase()) ? 0 : 2;
  const num = (value) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const money = (value) => `${currency} ${num(value)}`;

  const shopName = settings.shop?.name || settings.shopName || 'StockDesk';
  const saleDate = new Date(sale.createdAt);
  const receiptNumber = sale.receipt?.receiptNumber || `SD-${String(sale.id).padStart(6, '0')}`;
  const cashierName = sale.cashier?.name || '-';
  const customer = sale.customer && sale.customer.name !== 'Walk-in Customer' ? sale.customer : null;

  const items = (sale.items || []).map((item) => {
    const price = Number(item.price || 0);
    const product = item.Product || {};
    return {
      name: product.name?.trim() || 'Item',
      detail: product.type === 'service' ? 'Service' : (product.category || '').trim(),
      quantity: Number(item.quantity || 0),
      price,
      // Catalogue price before a per-item discount (older sales: same as price).
      listPrice: Math.max(price, Number(item.listPrice || 0)),
    };
  });
  const units = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemSavings = items.reduce((sum, item) => sum + (item.listPrice - item.price) * item.quantity, 0);
  const discount = Number(sale.discount || 0);
  const vatPercent = Number(sale.tax != null ? sale.tax : settings.vat || 0);
  const vatAmount = Number(sale.taxAmount || 0);
  const total = Number(sale.total || 0);
  const balanceDue = Number(sale.balanceDue || 0);
  const isCreditSale = Number(sale.creditAmount || 0) > 0;
  const owing = isCreditSale && balanceDue > 0;
  const splits = Array.isArray(sale.paymentSplits) ? sale.paymentSplits.filter((s) => Number(s.amount) > 0) : [];

  const logoBuffer = await loadRemoteImageBuffer(settings.shopLogoUrl);
  const footerTop = pageHeight - 78;
  const bottomLimit = footerTop - 20;

  // Table columns (right edges for the numeric ones).
  const col = { qtyRight: right - 200, priceRight: right - 100, totalRight: right };
  const itemWidth = col.qtyRight - 40 - margin - 12;

  let y = margin;
  doc.pipe(stream);

  const rule = (top) => doc.moveTo(margin, top).lineTo(right, top).lineWidth(0.7).strokeColor(COLORS.hairline).stroke();
  const label = (text, x, top, options = {}) => {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.label).text(text.toUpperCase(), x, top, { characterSpacing: 1.2, lineBreak: false, ...options });
  };

  const drawTableHeader = () => {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#374151');
    doc.text('ITEM', margin, y, { lineBreak: false, characterSpacing: 0.6 });
    doc.text('QTY', col.qtyRight - 40, y, { width: 40, align: 'right', characterSpacing: 0.6 });
    doc.text('PRICE', col.priceRight - 95, y, { width: 95, align: 'right', characterSpacing: 0.6 });
    doc.text('TOTAL', col.totalRight - 95, y, { width: 95, align: 'right', characterSpacing: 0.6 });
    y += 18;
    rule(y);
  };

  const newPageIfNeeded = (height, withTableHeader) => {
    if (y + height <= bottomLimit) return;
    doc.addPage();
    y = margin;
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.label).text(`${shopName} · Receipt ${receiptNumber} (continued)`, margin, y);
    y += 26;
    if (withTableHeader) drawTableHeader();
  };

  // ---- Header: shop (left), document (right) --------------------------------
  const leftWidth = 300;
  let leftY = y;
  let drewLogo = false;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, margin, leftY, { fit: [150, 46], align: 'left', valign: 'top' });
      leftY += 58;
      drewLogo = true;
    } catch (error) {
      drewLogo = false;
    }
  }
  // With a logo the shop name sits under it; without one the name itself is
  // the wordmark, shown once.
  if (drewLogo) {
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor(COLORS.ink).text(shopName, margin, leftY, { width: leftWidth });
  } else {
    doc.font('Helvetica-Bold').fontSize(19).fillColor(COLORS.accent).text(shopName, margin, leftY, { width: leftWidth });
    doc.y += 4;
  }
  doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.body);
  if (settings.address) doc.text(settings.address, margin, doc.y + 2, { width: leftWidth });
  if (settings.phone) doc.text(settings.phone, margin, doc.y + 2, { width: leftWidth });
  const leftBottom = doc.y;

  doc.font('Helvetica').fontSize(24).fillColor(COLORS.ink).text('Receipt', right - 200, y, { width: 200, align: 'right' });
  // "Receipt SD-000123" with the number in bold, right-aligned by hand
  // (PDFKit's continued text does not right-align reliably).
  doc.fontSize(10.5);
  const prefix = 'Receipt ';
  const prefixWidth = doc.font('Helvetica').widthOfString(prefix);
  const numberWidth = doc.font('Helvetica-Bold').widthOfString(receiptNumber);
  const numberY = y + 34;
  doc.font('Helvetica').fillColor(COLORS.body).text(prefix, right - prefixWidth - numberWidth, numberY, { lineBreak: false });
  doc.font('Helvetica-Bold').fillColor(COLORS.ink).text(receiptNumber, right - numberWidth, numberY, { lineBreak: false });
  doc.font('Helvetica').fillColor(COLORS.body).text(
    `${formatDate(saleDate, { day: 'numeric', month: 'short', year: 'numeric' })}, ${saleDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
    right - 200, numberY + 16, { width: 200, align: 'right' }
  );
  const rightBottom = numberY + 30;

  y = Math.max(leftBottom, rightBottom) + 20;
  rule(y);
  y += 20;

  // ---- Customer / served by --------------------------------------------------
  const half = contentWidth / 2;
  label('Customer', margin, y);
  label('Served by', margin + half, y);
  const partyTop = y + 18;
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLORS.ink).text(customer ? customer.name : 'Walk-in customer', margin, partyTop, { width: half - 20 });
  doc.font('Helvetica').fillColor(COLORS.ink);
  if (customer?.phone) doc.text(customer.phone, margin, doc.y + 2, { width: half - 20 });
  if (customer?.email) doc.text(customer.email, margin, doc.y + 2, { width: half - 20 });
  const customerBottom = doc.y;
  doc.font('Helvetica-Bold').text(cashierName, margin + half, partyTop, { width: half });
  doc.font('Helvetica').text(`${units} item${units === 1 ? '' : 's'}`, margin + half, doc.y + 2, { width: half });
  y = Math.max(customerBottom, doc.y) + 20;
  rule(y);
  y += 22;

  // ---- Items -------------------------------------------------------------------
  drawTableHeader();
  items.forEach((item) => {
    const detail = [item.detail, item.listPrice > item.price ? `Was ${money(item.listPrice)}` : ''].filter(Boolean).join(' · ');
    doc.font('Helvetica').fontSize(10.5);
    const nameHeight = doc.heightOfString(item.name, { width: itemWidth });
    const rowHeight = nameHeight + (detail ? 13 : 0) + 24;
    newPageIfNeeded(rowHeight, true);

    const ty = y + 12;
    doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.ink).text(item.name, margin, ty, { width: itemWidth });
    if (detail) doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.label).text(detail, margin, doc.y + 2, { width: itemWidth });
    doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.ink);
    doc.text(String(item.quantity), col.qtyRight - 40, ty, { width: 40, align: 'right' });
    doc.text(money(item.price), col.priceRight - 95, ty, { width: 95, align: 'right' });
    doc.text(money(item.price * item.quantity), col.totalRight - 95, ty, { width: 95, align: 'right' });
    y += rowHeight;
    rule(y);
  });

  // ---- Totals ----------------------------------------------------------------
  const sums = [
    ['Subtotal', money(subtotal + itemSavings)],
    ...(itemSavings > 0 ? [['Item discounts', `-${money(itemSavings)}`]] : []),
    ...(discount > 0 ? [['Discount', `-${money(discount)}`]] : []),
    ...(vatAmount > 0 ? [[`VAT ${vatPercent}%`, money(vatAmount)]] : []),
  ];
  const after = [
    ...(isCreditSale ? [['Paid', money(total - balanceDue), false]] : []),
    ...(owing ? [['Balance due', money(balanceDue), true]] : []),
  ];
  const sumsWidth = 230;
  const sumsX = right - sumsWidth;
  const sumsHeight = sums.length * 19 + 40 + after.length * 19;
  newPageIfNeeded(sumsHeight + 110, false);
  y += 14;
  sums.forEach(([key, value]) => {
    doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.body).text(key, sumsX, y, { lineBreak: false });
    doc.fillColor(COLORS.ink).text(value, sumsX, y, { width: sumsWidth, align: 'right' });
    y += 19;
  });
  y += 4;
  doc.moveTo(sumsX, y).lineTo(right, y).lineWidth(0.7).strokeColor(COLORS.hairline).stroke();
  y += 10;
  doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.ink).text('Total', sumsX, y, { lineBreak: false });
  doc.text(money(total), sumsX, y, { width: sumsWidth, align: 'right' });
  y += 26;
  after.forEach(([key, value, isDue]) => {
    doc.font(isDue ? 'Helvetica-Bold' : 'Helvetica').fontSize(10.5).fillColor(isDue ? COLORS.due : COLORS.body).text(key, sumsX, y, { lineBreak: false });
    doc.fillColor(isDue ? COLORS.due : COLORS.ink).text(value, sumsX, y, { width: sumsWidth, align: 'right' });
    y += 19;
  });

  // ---- Payment panel -------------------------------------------------------------
  y += 16;
  const method = isCreditSale
    ? 'Credit'
    : sale.paymentMethod === 'Split' && splits.length
      ? splits.map((s) => `${s.method} ${money(s.amount)}`).join(' · ')
      : sale.paymentMethod || '-';
  const status = owing ? (total - balanceDue > 0 ? 'Part paid' : 'Unpaid') : 'Paid';
  const cells = [
    ['Payment method', method, COLORS.ink],
    ['Payment status', status, owing ? COLORS.due : COLORS.ok],
    ...(owing
      ? [[sale.dueDate ? 'Due date' : 'Balance', sale.dueDate ? formatDate(`${sale.dueDate}T00:00:00`, { day: 'numeric', month: 'short', year: 'numeric' }) : money(balanceDue), COLORS.ink]]
      : []),
  ];
  const panelHeight = 50;
  doc.roundedRect(margin, y, contentWidth, panelHeight, 11).fill(COLORS.panel);
  const cellWidth = (contentWidth - 32) / cells.length;
  cells.forEach(([key, value, color], i) => {
    const x = margin + 16 + i * cellWidth;
    doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.body).text(key, x, y + 11, { width: cellWidth - 12, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(color).text(value, x, y + 26, { width: cellWidth - 12, lineBreak: false, ellipsis: true });
  });
  y += panelHeight;

  if (settings.receiptHeader) {
    y += 16;
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.body).text(settings.receiptHeader, margin, y, { width: contentWidth });
  }

  // ---- Footer on every page ---------------------------------------------------
  const thanks = `${settings.receiptFooter || 'Thank you for your business!'} Please keep this receipt for returns and warranty claims.`;
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i += 1) {
    doc.switchToPage(i);
    rule(footerTop);
    doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.body)
      .text(thanks, margin, footerTop + 12, { width: contentWidth, align: 'center', height: 26, ellipsis: true });
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.faint)
      .text(`Powered by StockDesk · stockdeskinventory.com${pageCount > 1 ? `   ·   Page ${i + 1} of ${pageCount}` : ''}`, margin, footerTop + 42, { width: contentWidth, align: 'center', lineBreak: false, link: 'https://stockdeskinventory.com' });
  }

  doc.end();
};
