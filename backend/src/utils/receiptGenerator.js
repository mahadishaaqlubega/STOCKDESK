const PDFDocument = require('pdfkit');

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

exports.generateReceiptPdf = async (stream, sale, settings) => {
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;
  const accent = '#1F7A8C';
  const accentSoft = '#EAF6F8';
  const dark = '#102A43';
  const muted = '#5C6B7A';
  const border = '#D9E2EC';
  const saleDate = new Date(sale.createdAt);
  const currency = sale.currency || settings.currency || 'USD';
  const shopName = settings.shop?.name || settings.shopName || 'StockDesk';
  const shopSlug = settings.shop?.slug || `shop-${settings.shopId || 'legacy'}`;

  let subtotal = 0;
  sale.items.forEach((item) => {
    subtotal += parseFloat(item.price) * item.quantity;
  });

  const discount = parseFloat(sale.discount || 0);
  // Use the tax actually charged on the sale, not today's settings.
  const vatPercent = parseFloat(sale.tax != null ? sale.tax : settings.vat || 0);
  const vatAmount = parseFloat(sale.taxAmount || 0);
  const total = parseFloat(sale.total || 0);
  const creditAmount = parseFloat(sale.creditAmount || 0);
  const balanceDue = parseFloat(sale.balanceDue || 0);
  const isCreditSale = creditAmount > 0;

  const money = (value) => `${currency} ${parseFloat(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const logoBuffer = await loadRemoteImageBuffer(settings.shopLogoUrl);
  const bottomLimit = pageHeight - margin - 36;
  const paymentMethod = sale.paymentMethod || 'N/A';
  const cashierName = sale.cashier?.name || 'N/A';
  const receiptNumber = sale.receipt?.receiptNumber || `SD-${String(sale.id).padStart(6, '0')}`;

  let cursorY = 0;

  doc.pipe(stream);

  const drawHeader = (title = 'SALES RECEIPT') => {
    doc.rect(0, 0, pageWidth, 104).fill(accent);
    if (logoBuffer) {
      try {
        doc.roundedRect(margin, 22, 52, 52, 12).fillOpacity(0.18).fillAndStroke('#ffffff', '#ffffff');
        doc.fillOpacity(1);
        doc.image(logoBuffer, margin + 6, 28, { fit: [40, 40], align: 'center', valign: 'center' });
      } catch (error) {
        doc.fillOpacity(1);
      }
    }

    doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text(title, margin, 34, {
      align: 'right',
      width: contentWidth,
    });
    doc.font('Helvetica-Bold').fontSize(12).text(shopName, logoBuffer ? margin + 66 : margin, 28, { width: 240 });
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#DFF6FB').text(shopSlug.toUpperCase(), logoBuffer ? margin + 66 : margin, 16, {
      width: 240,
      characterSpacing: 1,
    });
    doc.fillColor('white').font('Helvetica').fontSize(9);
    if (settings.address) {
      doc.text(settings.address, logoBuffer ? margin + 66 : margin, 44, { width: 250 });
    }
    if (settings.phone) {
      doc.text(settings.phone, logoBuffer ? margin + 66 : margin, 68, { width: 250 });
    }

    cursorY = 126;
  };

  const ensureSpace = (heightNeeded, nextSection = 'content') => {
    if (cursorY + heightNeeded <= bottomLimit) {
      return;
    }

    doc.addPage();
    drawHeader(nextSection === 'items' ? 'SALES RECEIPT' : 'RECEIPT DETAILS');
    if (nextSection === 'items') {
      drawItemsHeader();
    }
  };

  const drawLabelValue = (label, value, x, y, width = 150) => {
    doc.fillColor(muted).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), x, y, {
      width,
      characterSpacing: 0.5,
    });
    doc.fillColor(dark).font('Helvetica').fontSize(10.5).text(value, x, y + 12, { width });
  };

  const drawItemsHeader = () => {
    doc.roundedRect(margin, cursorY, contentWidth, 28, 10).fill(accentSoft);
    doc.fillColor(accent).font('Helvetica-Bold').fontSize(10);
    doc.text('QTY', margin + 14, cursorY + 9, { width: 36 });
    doc.text('ITEM DESCRIPTION', margin + 64, cursorY + 9, { width: 250 });
    doc.text('RATE', margin + 352, cursorY + 9, { width: 82, align: 'right' });
    doc.text('AMOUNT', margin + 444, cursorY + 9, { width: 78, align: 'right' });
    cursorY += 42;
  };

  drawHeader();

  drawLabelValue('Receipt No.', receiptNumber, margin, cursorY, 140);
  drawLabelValue('Date', saleDate.toLocaleDateString(), margin + 166, cursorY, 120);
  drawLabelValue('Time', saleDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), margin + 332, cursorY, 120);
  cursorY += 44;
  drawLabelValue('Cashier', cashierName, margin, cursorY, 140);
  drawLabelValue('Payment', paymentMethod, margin + 166, cursorY, 120);
  drawLabelValue('Currency', currency, margin + 332, cursorY, 120);
  cursorY += 44;
  drawLabelValue('Shop', shopSlug, margin, cursorY, 180);
  cursorY += 52;

  drawItemsHeader();
  doc.font('Helvetica').fontSize(10).fillColor(dark);

  sale.items.forEach((item, index) => {
    const itemName = item.Product?.name || 'Item';
    const lineTotal = parseFloat(item.price) * item.quantity;
    const descriptionHeight = doc.heightOfString(itemName, {
      width: 250,
      align: 'left',
    });
    const rowHeight = Math.max(28, descriptionHeight + 10);
    ensureSpace(rowHeight + 10, 'items');

    if (index % 2 === 0) {
      doc.rect(margin, cursorY - 6, contentWidth, rowHeight).fill('#FAFCFD');
    }

    doc.fillColor(dark);
    doc.text(String(item.quantity), margin + 18, cursorY + 4, { width: 24 });
    doc.text(itemName, margin + 64, cursorY + 4, { width: 250 });
    doc.text(money(item.price), margin + 352, cursorY + 4, { width: 82, align: 'right' });
    doc.font('Helvetica-Bold').text(money(lineTotal), margin + 444, cursorY + 4, { width: 78, align: 'right' });
    doc.font('Helvetica');
    cursorY += rowHeight;
  });

  const notesText = settings.receiptHeader || 'Please keep this receipt for exchange, returns, or warranty support.';
  const footerText = settings.receiptFooter || 'Thank you for shopping with us.';
  const notesWidth = 270;
  const gap = 16;
  const summaryWidth = contentWidth - notesWidth - gap;
  const notesBodyWidth = notesWidth - 36;
  const notesBodyHeight = doc.heightOfString(notesText, { width: notesBodyWidth, lineGap: 2 }) + doc.heightOfString(footerText, { width: notesBodyWidth, lineGap: 2 }) + 28;
  const notesHeight = Math.max(118, notesBodyHeight + 40);
  const summaryHeight = isCreditSale ? 240 : 184;
  const sectionHeight = Math.max(notesHeight, summaryHeight);

  ensureSpace(sectionHeight + 24, 'summary');
  const sectionTop = cursorY + 18;
  const summaryX = margin + notesWidth + gap;

  doc.roundedRect(margin, sectionTop, notesWidth, sectionHeight, 12).strokeColor(border).lineWidth(1).stroke();
  doc.fillColor(accent).font('Helvetica-Bold').fontSize(11).text('Terms & Notes', margin + 18, sectionTop + 16);
  doc.fillColor(muted).font('Helvetica').fontSize(10).text(notesText, margin + 18, sectionTop + 40, {
    width: notesWidth - 36,
    lineGap: 2,
  });
  const footerStartY = sectionTop + 40 + doc.heightOfString(notesText, { width: notesWidth - 36, lineGap: 2 }) + 18;
  doc.text(footerText, margin + 18, footerStartY, {
    width: notesWidth - 36,
    lineGap: 2,
  });
  doc.font('Helvetica').fontSize(9).fillColor(muted).text(`Payment: ${paymentMethod}`, margin + 18, sectionTop + sectionHeight - 34, {
    width: notesWidth - 36,
  });
  doc.text(`Cashier: ${cashierName}`, margin + 18, sectionTop + sectionHeight - 20, { width: notesWidth - 36 });

  doc.roundedRect(summaryX, sectionTop, summaryWidth, sectionHeight, 12).fillAndStroke('#FBFDFD', border);
  let summaryY = sectionTop + 18;
  doc.fillColor(muted).font('Helvetica-Bold').fontSize(8).text('RECEIPT SUMMARY', summaryX + 16, summaryY, {
    width: summaryWidth - 32,
    characterSpacing: 1,
  });
  summaryY += 24;

  const drawSummaryRow = (label, value, options = {}) => {
    if (options.highlight) {
      doc.roundedRect(summaryX + 12, summaryY, summaryWidth - 24, 46, 8).fill(accent);
      doc.fillColor('white');
    } else {
      doc.moveTo(summaryX + 16, summaryY - 6).lineTo(summaryX + summaryWidth - 16, summaryY - 6).strokeColor('#E7EEF3').lineWidth(1).stroke();
      doc.fillColor(options.color || muted);
    }

    doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.size || 10);
    doc.text(label, summaryX + 18, summaryY + (options.highlight ? 14 : 0), { width: 92 });
    doc.font(options.highlight ? 'Helvetica-Bold' : 'Courier').fontSize(options.size || 10);
    doc.text(value, summaryX + 118, summaryY + (options.highlight ? 11 : 0), {
      width: summaryWidth - 138,
      align: 'right',
    });
    summaryY += options.spacing || (options.highlight ? 58 : 28);
  };

  drawSummaryRow('Subtotal', money(subtotal), { color: dark });
  drawSummaryRow('Discount', `${discount > 0 ? '- ' : ''}${money(discount)}`, { color: discount > 0 ? '#C81E1E' : '#9AA5B1' });
  drawSummaryRow(`VAT (${vatPercent.toFixed(2)}%)`, money(vatAmount), { color: vatAmount > 0 ? dark : '#9AA5B1' });
  drawSummaryRow('Total', money(total), { bold: true, size: 15, highlight: true });
  if (isCreditSale) {
    drawSummaryRow('Paid', money(total - balanceDue), { color: dark });
    drawSummaryRow('Balance due', money(balanceDue), { bold: true, color: balanceDue > 0 ? '#C81E1E' : dark });
  }

  doc.end();
};
