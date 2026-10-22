const PDFDocument = require('pdfkit');

// Currencies written without a minor unit (ISO 4217 exponent 0), e.g. UGX.
const ZERO_DECIMAL_CURRENCIES = new Set([
  'UGX', 'RWF', 'BIF', 'GNF', 'KMF', 'DJF', 'XOF', 'XAF', 'XPF',
  'JPY', 'KRW', 'VND', 'CLP', 'PYG', 'ISK', 'VUV',
]);

// Palette shared with the on-screen A4 receipt.
const COLORS = {
  ink: '#0F172A',
  body: '#334155',
  muted: '#64748B',
  faint: '#94A3B8',
  hairline: '#E2E8F0',
  zebra: '#FAFBFC',
  card: '#F8FAFC',
  accent: '#0D9488',
  accentLight: '#5EEAD4',
  accentPale: '#CCFBF1',
  paidBg: '#DCFCE7',
  paidText: '#15803D',
  dueBg: '#FEF3C7',
  dueText: '#B45309',
  dueWash: '#FFFBEB',
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
  if (!/^https?:\/\//i.test(url)) {
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
  const margin = 46;
  const contentWidth = pageWidth - margin * 2;
  const right = pageWidth - margin;

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
    name: item.Product?.name?.trim() || 'Item',
    quantity: Number(item.quantity || 0),
    price: Number(item.price || 0),
  }));
  const units = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = Number(sale.discount || 0);
  const vatPercent = Number(sale.tax != null ? sale.tax : settings.vat || 0);
  const vatAmount = Number(sale.taxAmount || 0);
  const total = Number(sale.total || 0);
  const balanceDue = Number(sale.balanceDue || 0);
  const isCreditSale = Number(sale.creditAmount || 0) > 0;
  const owing = isCreditSale && balanceDue > 0;
  const splits = Array.isArray(sale.paymentSplits) ? sale.paymentSplits.filter((s) => Number(s.amount) > 0) : [];

  const logoBuffer = await loadRemoteImageBuffer(settings.shopLogoUrl);
  const footerTop = pageHeight - margin - 22;
  const bottomLimit = footerTop - 24;

  // Table columns
  const col = {
    idx: margin + 12,
    item: margin + 40,
    qty: margin + 300,
    price: margin + 345,
    amount: right - 112,
  };

  let y = 0;
  doc.pipe(stream);

  const label = (text, x, top, options = {}) => {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.faint).text(text.toUpperCase(), x, top, { characterSpacing: 1, lineBreak: false, ...options });
  };

  const drawBand = () => {
    const gradient = doc.linearGradient(0, 0, pageWidth, 0);
    gradient.stop(0, COLORS.accent).stop(0.6, '#14B8A6').stop(1, COLORS.accentLight);
    doc.rect(0, 0, pageWidth, 7).fill(gradient);
  };

  const drawTableHeader = () => {
    doc.roundedRect(margin, y, contentWidth, 26, 7).fill(COLORS.ink);
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
    const ty = y + 9.5;
    doc.text('#', col.idx, ty, { lineBreak: false, characterSpacing: 0.6 });
    doc.text('ITEM', col.item, ty, { lineBreak: false, characterSpacing: 0.6 });
    doc.text('QTY', col.qty, ty, { width: 34, align: 'right', characterSpacing: 0.6 });
    doc.text('PRICE', col.price, ty, { width: col.amount - col.price - 8, align: 'right', characterSpacing: 0.6 });
    doc.text(`AMOUNT (${currency})`, col.amount, ty, { width: right - col.amount - 12, align: 'right', characterSpacing: 0.6 });
    y += 26;
  };

  const newPageIfNeeded = (height, withTableHeader) => {
    if (y + height <= bottomLimit) return;
    doc.addPage();
    drawBand();
    y = margin;
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(`${shopName} · ${receiptNumber} (continued)`, margin, y);
    y += 24;
    if (withTableHeader) drawTableHeader();
  };

  // ---- Header -------------------------------------------------------------
  drawBand();
  y = margin;
  let textX = margin;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, margin, y, { fit: [58, 58], align: 'center', valign: 'center' });
      textX = margin + 72;
    } catch (error) {
      textX = margin;
    }
  }
  if (textX === margin) {
    doc.roundedRect(margin, y, 54, 54, 13).fill(COLORS.accent);
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#FFFFFF').text(shopName.slice(0, 1).toUpperCase(), margin, y + 15, { width: 54, align: 'center' });
    textX = margin + 68;
  }
  doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.ink).text(shopName, textX, y + 4, { width: 250 });
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
  if (settings.address) doc.text(settings.address, textX, doc.y + 2, { width: 250 });
  if (settings.phone) doc.text(`Tel ${settings.phone}`, textX, doc.y + 1, { width: 250 });
  const brandBottom = Math.max(doc.y, y + 58);

  // Document block (right)
  const docX = right - 210;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.accent).text('RECEIPT', docX, y + 2, { width: 210, align: 'right', characterSpacing: 1.8 });
  doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.ink).text(receiptNumber, docX, y + 15, { width: 210, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(
    `${formatDate(saleDate, { day: 'numeric', month: 'long', year: 'numeric' })} · ${saleDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
    docX, y + 40, { width: 210, align: 'right' }
  );
  const stampText = owing ? 'BALANCE DUE' : 'PAID';
  doc.font('Helvetica-Bold').fontSize(8);
  const stampWidth = doc.widthOfString(stampText, { characterSpacing: 1 }) + 22;
  doc.roundedRect(right - stampWidth, y + 56, stampWidth, 18, 9).fill(owing ? COLORS.dueBg : COLORS.paidBg);
  doc.fillColor(owing ? COLORS.dueText : COLORS.paidText).text(stampText, right - stampWidth, y + 61, { width: stampWidth, align: 'center', characterSpacing: 1 });

  y = Math.max(brandBottom, y + 76) + 22;

  // ---- Info cards ---------------------------------------------------------
  const gap = 10;
  const cardWidth = (contentWidth - gap * 2) / 3;
  const paymentLines = isCreditSale
    ? ['Credit sale', sale.dueDate ? `Due ${formatDate(`${sale.dueDate}T00:00:00`, { day: 'numeric', month: 'short', year: 'numeric' })}` : null]
    : sale.paymentMethod === 'Split' && splits.length
      ? [splits.map((s) => s.method).join(' + '), splits.map((s) => num(s.amount)).join(' + ')]
      : [sale.paymentMethod || '—'];
  const cards = [
    ['Billed to', customer ? customer.name : 'Walk-in customer', customer?.phone || null],
    ['Served by', cashierName, `${units} item${units === 1 ? '' : 's'}`],
    ['Payment', paymentLines[0], paymentLines[1] || null],
  ];
  const cardHeight = 58;
  cards.forEach(([title, value, extra], i) => {
    const x = margin + i * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, cardHeight, 9).lineWidth(0.8).fillAndStroke(COLORS.card, COLORS.hairline);
    label(title, x + 12, y + 11);
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLORS.ink).text(value, x + 12, y + 25, { width: cardWidth - 24, lineBreak: false, ellipsis: true });
    if (extra) doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text(extra, x + 12, y + 40, { width: cardWidth - 24, lineBreak: false, ellipsis: true });
  });
  y += cardHeight + 22;

  // ---- Items --------------------------------------------------------------
  drawTableHeader();
  items.forEach((item, index) => {
    doc.font('Helvetica').fontSize(10);
    const nameWidth = col.qty - col.item - 12;
    const nameHeight = doc.heightOfString(item.name, { width: nameWidth });
    const rowHeight = Math.max(14, nameHeight) + 14;
    newPageIfNeeded(rowHeight, true);

    if (index % 2 === 1) doc.rect(margin, y, contentWidth, rowHeight).fill(COLORS.zebra);
    const ty = y + 7;
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.faint).text(String(index + 1), col.idx, ty + 1, { lineBreak: false });
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.ink).text(item.name, col.item, ty, { width: nameWidth });
    doc.text(String(item.quantity), col.qty, ty, { width: 34, align: 'right' });
    doc.fillColor(COLORS.muted).text(num(item.price), col.price, ty, { width: col.amount - col.price - 8, align: 'right' });
    doc.font('Helvetica-Bold').fillColor(COLORS.ink).text(num(item.price * item.quantity), col.amount, ty, { width: right - col.amount - 12, align: 'right' });
    y += rowHeight;
    doc.moveTo(margin, y).lineTo(right, y).lineWidth(0.6).strokeColor('#EEF2F6').stroke();
  });

  // ---- Totals + notes -----------------------------------------------------
  const totalsWidth = 230;
  const totalsX = right - totalsWidth;
  const rows = [
    ['Subtotal', num(subtotal)],
    ...(discount > 0 ? [['Discount', `-${num(discount)}`]] : []),
    ...(vatAmount > 0 ? [[`VAT ${vatPercent}%`, num(vatAmount)]] : []),
  ];
  const rowH = 22;
  const grandH = 34;
  const creditRows = isCreditSale ? 2 : 0;
  const boxHeight = rows.length * rowH + grandH + creditRows * rowH + 8;
  newPageIfNeeded(boxHeight + 30, false);
  y += 18;
  const boxTop = y;

  // Notes (left)
  label('Notes', margin, boxTop + 2);
  const notes = [settings.receiptHeader, 'Please keep this receipt for returns and warranty claims.'].filter(Boolean).join('\n');
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.body).text(notes, margin, boxTop + 16, { width: totalsX - margin - 30, lineGap: 2 });

  // Totals box (right)
  doc.save();
  doc.roundedRect(totalsX, boxTop, totalsWidth, boxHeight, 10).clip();
  doc.rect(totalsX, boxTop, totalsWidth, boxHeight).fill('#FFFFFF');
  let ty = boxTop + 4;
  rows.forEach(([key, value]) => {
    doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.muted).text(key, totalsX + 14, ty + 6, { lineBreak: false });
    doc.fillColor(COLORS.ink).text(value, totalsX, ty + 6, { width: totalsWidth - 14, align: 'right' });
    ty += rowH;
  });
  doc.rect(totalsX, ty, totalsWidth, grandH).fill(COLORS.accent);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.accentPale).text('Total', totalsX + 14, ty + 12, { lineBreak: false });
  doc.fontSize(14).fillColor('#FFFFFF').text(money(total), totalsX, ty + 9.5, { width: totalsWidth - 14, align: 'right' });
  ty += grandH;
  if (isCreditSale) {
    doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.muted).text('Paid', totalsX + 14, ty + 6, { lineBreak: false });
    doc.font('Helvetica-Bold').fillColor(COLORS.ink).text(num(total - balanceDue), totalsX, ty + 6, { width: totalsWidth - 14, align: 'right' });
    ty += rowH;
    doc.rect(totalsX, ty, totalsWidth, rowH + 8).fill(COLORS.dueWash);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.dueText).text('Balance due', totalsX + 14, ty + 8, { lineBreak: false });
    doc.text(money(balanceDue), totalsX, ty + 8, { width: totalsWidth - 14, align: 'right' });
  }
  doc.restore();
  doc.roundedRect(totalsX, boxTop, totalsWidth, boxHeight, 10).lineWidth(0.8).strokeColor(COLORS.hairline).stroke();

  // ---- Footer on every page -----------------------------------------------
  const footerLine = [shopName, settings.phone].filter(Boolean).join(' · ');
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i += 1) {
    doc.switchToPage(i);
    doc.moveTo(margin, footerTop - 10).lineTo(right, footerTop - 10).lineWidth(0.6).strokeColor(COLORS.hairline).stroke();
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.ink)
      .text(settings.receiptFooter || 'Thank you for your business!', margin, footerTop, { width: contentWidth / 2, lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
      .text(`${footerLine}${pageCount > 1 ? ` · Page ${i + 1} of ${pageCount}` : ''}`, margin + contentWidth / 2, footerTop + 1.5, { width: contentWidth / 2, align: 'right', lineBreak: false, ellipsis: true });
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted)
      .text('Powered by StockDesk · stockdeskinventory.com', margin, footerTop + 16, { width: contentWidth, align: 'center', lineBreak: false, link: 'https://stockdeskinventory.com' });
  }

  doc.end();
};
