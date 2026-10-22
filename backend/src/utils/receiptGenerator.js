const PDFDocument = require('pdfkit');

// Currencies written without a minor unit (ISO 4217 exponent 0), e.g. UGX.
const ZERO_DECIMAL_CURRENCIES = new Set([
  'UGX', 'RWF', 'BIF', 'GNF', 'KMF', 'DJF', 'XOF', 'XAF', 'XPF',
  'JPY', 'KRW', 'VND', 'CLP', 'PYG', 'ISK', 'VUV',
]);

async function loadRemoteImageBuffer(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return null;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    return null;
  }
}

function formatDate(value, options) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleDateString('en-GB', options);
}

exports.generateReceiptPdf = async (stream, sale, settings) => {
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, info: { Title: 'Receipt', Producer: 'StockDesk' } });
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  const right = pageWidth - margin;

  const ink = '#0F172A';
  const muted = '#64748B';
  const hairline = '#E2E8F0';
  const accent = '#0D9488';

  const currency = sale.currency || settings.currency || 'USD';
  const decimals = ZERO_DECIMAL_CURRENCIES.has(String(currency).toUpperCase()) ? 0 : 2;
  const num = (value) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const money = (value) => `${currency} ${num(value)}`;

  const shopName = settings.shop?.name || settings.shopName || 'StockDesk';
  const saleDate = new Date(sale.createdAt);
  const receiptNumber = sale.receipt?.receiptNumber || `SD-${String(sale.id).padStart(6, '0')}`;
  const cashierName = sale.cashier?.name || '—';
  const customer = sale.customer && sale.customer.name !== 'Walk-in Customer' ? sale.customer : null;

  const items = (sale.items || []).map((item) => ({
    name: item.Product?.name || 'Item',
    quantity: Number(item.quantity || 0),
    price: Number(item.price || 0),
  }));
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = Number(sale.discount || 0);
  const vatPercent = Number(sale.tax != null ? sale.tax : settings.vat || 0);
  const vatAmount = Number(sale.taxAmount || 0);
  const total = Number(sale.total || 0);
  const balanceDue = Number(sale.balanceDue || 0);
  const isCreditSale = Number(sale.creditAmount || 0) > 0;
  const splits = Array.isArray(sale.paymentSplits) ? sale.paymentSplits.filter((s) => Number(s.amount) > 0) : [];

  const logoBuffer = await loadRemoteImageBuffer(settings.shopLogoUrl);
  const bottomLimit = pageHeight - margin - 40;

  // Table columns
  const col = {
    item: margin,
    qty: margin + 300,
    price: margin + 340,
    amount: right - 100,
  };

  let y = margin;
  doc.pipe(stream);

  const label = (text, x, top, options = {}) => {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(muted).text(text.toUpperCase(), x, top, { characterSpacing: 0.8, ...options });
  };

  const drawTableHeader = () => {
    label('Item', col.item, y);
    label('Qty', col.qty, y, { width: 30, align: 'right' });
    label('Price', col.price, y, { width: col.amount - col.price - 10, align: 'right' });
    label('Amount', col.amount, y, { width: 100, align: 'right' });
    y += 14;
    doc.moveTo(margin, y).lineTo(right, y).lineWidth(1).strokeColor(ink).stroke();
    y += 10;
  };

  const newPageIfNeeded = (height, withTableHeader) => {
    if (y + height <= bottomLimit) return;
    doc.addPage();
    y = margin;
    doc.font('Helvetica').fontSize(9).fillColor(muted).text(`${shopName} · Receipt ${receiptNumber} (continued)`, margin, y);
    y += 28;
    if (withTableHeader) drawTableHeader();
  };

  // ---- Header -------------------------------------------------------------
  let shopX = margin;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, margin, y, { fit: [48, 48] });
      shopX = margin + 60;
    } catch (error) {
      shopX = margin;
    }
  }
  doc.font('Helvetica-Bold').fontSize(16).fillColor(ink).text(shopName, shopX, y, { width: 280 });
  doc.font('Helvetica').fontSize(9).fillColor(muted);
  const contact = [settings.address, settings.phone ? `Tel: ${settings.phone}` : null].filter(Boolean);
  if (contact.length) doc.text(contact.join('\n'), shopX, doc.y + 3, { width: 280, lineGap: 1.5 });
  const shopBottom = Math.max(doc.y, y + (logoBuffer ? 48 : 0));

  doc.font('Helvetica-Bold').fontSize(22).fillColor(ink).text('Receipt', margin, y - 2, { width: contentWidth, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(muted)
    .text(receiptNumber, margin, y + 26, { width: contentWidth, align: 'right' })
    .text(`${formatDate(saleDate, { day: 'numeric', month: 'long', year: 'numeric' })}, ${saleDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, margin, y + 39, { width: contentWidth, align: 'right' });

  y = Math.max(shopBottom, y + 56) + 18;
  doc.rect(margin, y, contentWidth, 2).fill(accent);
  y += 22;

  // ---- Parties / details --------------------------------------------------
  const detailTop = y;
  label('Billed to', margin, y);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(ink).text(customer ? customer.name : 'Walk-in customer', margin, y + 13, { width: 220 });
  if (customer?.phone) doc.font('Helvetica').fontSize(9).fillColor(muted).text(customer.phone, margin, doc.y + 2, { width: 220 });
  const leftBottom = doc.y;

  const details = [
    ['Served by', cashierName],
    ['Payment', isCreditSale ? 'Credit' : sale.paymentMethod || '—'],
    ...(isCreditSale && sale.dueDate ? [['Due date', formatDate(`${sale.dueDate}T00:00:00`, { day: 'numeric', month: 'short', year: 'numeric' })]] : []),
  ];
  let detailY = detailTop;
  details.forEach(([key, value]) => {
    label(key, margin + 300, detailY, { width: 80 });
    doc.font('Helvetica').fontSize(9.5).fillColor(ink).text(value, margin + 380, detailY - 1.5, { width: contentWidth - 380, align: 'right' });
    detailY += 16;
  });
  y = Math.max(leftBottom, detailY) + 26;

  // ---- Items --------------------------------------------------------------
  drawTableHeader();
  items.forEach((item) => {
    doc.font('Helvetica').fontSize(10);
    const nameHeight = doc.heightOfString(item.name, { width: col.qty - col.item - 16 });
    const rowHeight = Math.max(18, nameHeight) + 12;
    newPageIfNeeded(rowHeight, true);

    doc.fillColor(ink).text(item.name, col.item, y, { width: col.qty - col.item - 16 });
    doc.text(String(item.quantity), col.qty, y, { width: 30, align: 'right' });
    doc.fillColor(muted).text(num(item.price), col.price, y, { width: col.amount - col.price - 10, align: 'right' });
    doc.font('Helvetica-Bold').fillColor(ink).text(num(item.price * item.quantity), col.amount, y, { width: 100, align: 'right' });
    y += rowHeight;
    doc.moveTo(margin, y - 6).lineTo(right, y - 6).lineWidth(0.6).strokeColor(hairline).stroke();
  });

  // ---- Totals -------------------------------------------------------------
  const totalsX = margin + 300;
  const totalsWidth = right - totalsX;
  const rows = [
    ['Subtotal', num(subtotal)],
    ...(discount > 0 ? [['Discount', `-${num(discount)}`]] : []),
    ...(vatAmount > 0 ? [[`VAT ${vatPercent}%`, num(vatAmount)]] : []),
  ];
  const paymentRows = isCreditSale
    ? [['Paid', num(total - balanceDue)]]
    : sale.paymentMethod === 'Split'
      ? splits.map((s) => [`Paid (${s.method})`, num(s.amount)])
      : [];
  const totalsHeight = rows.length * 18 + 40 + paymentRows.length * 18 + (isCreditSale ? 50 : 0);
  newPageIfNeeded(totalsHeight + 20, false);
  y += 6;

  rows.forEach(([key, value]) => {
    doc.font('Helvetica').fontSize(10).fillColor(muted).text(key, totalsX, y, { width: totalsWidth / 2 });
    doc.fillColor(ink).text(value, totalsX, y, { width: totalsWidth, align: 'right' });
    y += 18;
  });
  doc.moveTo(totalsX, y).lineTo(right, y).lineWidth(1).strokeColor(ink).stroke();
  y += 10;
  doc.font('Helvetica-Bold').fontSize(13).fillColor(ink).text('Total', totalsX, y, { width: totalsWidth / 2 });
  doc.text(money(total), totalsX, y, { width: totalsWidth, align: 'right' });
  y += 28;

  paymentRows.forEach(([key, value]) => {
    doc.font('Helvetica').fontSize(10).fillColor(muted).text(key, totalsX, y, { width: totalsWidth / 2 });
    doc.fillColor(ink).text(value, totalsX, y, { width: totalsWidth, align: 'right' });
    y += 18;
  });

  if (isCreditSale) {
    y += 4;
    doc.roundedRect(totalsX, y, totalsWidth, 34, 4).lineWidth(1.2).strokeColor(ink).stroke();
    doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text('Balance due', totalsX + 10, y + 11, { width: totalsWidth / 2 });
    doc.text(money(balanceDue), totalsX, y + 11, { width: totalsWidth - 10, align: 'right' });
    y += 46;
  }

  // ---- Notes & footer -----------------------------------------------------
  const notes = [settings.receiptHeader, 'Please keep this receipt for returns and warranty claims.'].filter(Boolean).join('\n');
  newPageIfNeeded(80, false);
  y += 18;
  label('Notes', margin, y);
  doc.font('Helvetica').fontSize(9).fillColor(muted).text(notes, margin, y + 13, { width: 280, lineGap: 2 });

  const footerY = pageHeight - margin - 14;
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i += 1) {
    doc.switchToPage(i);
    doc.moveTo(margin, footerY - 12).lineTo(right, footerY - 12).lineWidth(0.6).strokeColor(hairline).stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(ink)
      .text(settings.receiptFooter || 'Thank you for your business!', margin, footerY, { width: contentWidth / 2, lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor(muted)
      .text(`Powered by StockDesk${pageCount > 1 ? `  ·  Page ${i + 1} of ${pageCount}` : ''}`, margin, footerY + 1, { width: contentWidth, align: 'right', lineBreak: false });
  }

  doc.end();
};
