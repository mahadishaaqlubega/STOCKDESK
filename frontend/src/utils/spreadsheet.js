// Excel / CSV import and export in the browser. exceljs is loaded on first
// use only, so it never slows down the till.

const loadExcel = () => import('exceljs').then((m) => m.default || m);

const normalizeHeader = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Column names people actually use, mapped to our fields.
export const PRODUCT_COLUMNS = {
  name: ['name', 'product', 'productname', 'item', 'itemname', 'description'],
  category: ['category', 'group', 'department', 'type of product'],
  sku: ['sku', 'code', 'barcode', 'itemcode', 'productcode', 'ref'],
  type: ['type', 'kind', 'goodsorservice'],
  buyPrice: ['costprice', 'cost', 'buyprice', 'buyingprice', 'purchaseprice', 'unitcost'],
  sellPrice: ['sellingprice', 'sellprice', 'price', 'saleprice', 'retailprice', 'unitprice'],
  quantity: ['quantity', 'qty', 'stock', 'instock', 'onhand', 'stocklevel', 'units'],
  lowStock: ['reorderlevel', 'lowstock', 'reorder', 'minstock', 'minimum', 'alertlevel'],
};

export const CUSTOMER_COLUMNS = {
  name: ['name', 'customer', 'customername', 'fullname'],
  phone: ['phone', 'phonenumber', 'mobile', 'tel', 'telephone', 'contact'],
  whatsapp: ['whatsapp', 'whatsappnumber', 'wa'],
  email: ['email', 'emailaddress', 'mail'],
  address: ['address', 'location', 'town', 'area'],
  notes: ['notes', 'note', 'comments', 'remarks'],
};

function cellValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('result' in value) return cellValue(value.result); // formula
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('text' in value) return cellValue(value.text); // hyperlink
    if ('error' in value) return '';
  }
  return value;
}

// Excel adds a byte-order mark to UTF-8 CSV files.
const stripBom = (value) => (value.charCodeAt(0) === 0xfeff ? value.slice(1) : value);

// Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF). The
// separator is whichever of , ; or tab the header line uses most (Excel in
// some regions saves CSV with semicolons).
function parseCsv(textValue) {
  const firstLine = stripBom(textValue).split(/\r?\n/, 1)[0] || '';
  const delimiter = [',', ';', '\t'].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ',');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = stripBom(textValue);
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function readGrid(file) {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
    return parseCsv(await file.text());
  }
  if (!/\.xlsx$/i.test(file.name)) {
    throw new Error('Choose an Excel (.xlsx) or CSV file. Old .xls files: open in Excel and "Save as" .xlsx first.');
  }
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets.find((ws) => ws.actualRowCount > 0);
  if (!sheet) return [];
  const grid = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => { values[col - 1] = cellValue(cell.value); });
    grid[rowNumber - 1] = values;
  });
  return Array.from(grid, (r) => r || []);
}

// Returns { rows, matched, missing, ignored }: rows are objects keyed by our
// field names with __row = spreadsheet row number.
export async function readRows(file, columns, required = ['name']) {
  if (file.size > 8 * 1024 * 1024) throw new Error('That file is larger than 8 MB.');
  const grid = await readGrid(file);
  // The header is the first row that names at least one known column.
  const aliases = Object.fromEntries(Object.entries(columns).map(([field, list]) => [field, list.map(normalizeHeader)]));
  const headerIndex = grid.findIndex((r) => r.some((h) => Object.values(aliases).some((list) => list.includes(normalizeHeader(h)))));
  if (headerIndex === -1) throw new Error(`Couldn't find a header row. The first row should name the columns, e.g. ${Object.keys(columns).slice(0, 4).join(', ')}.`);
  const header = grid[headerIndex].map(normalizeHeader);
  const map = {};
  for (const [field, list] of Object.entries(aliases)) {
    const index = header.findIndex((h) => list.includes(h));
    if (index !== -1) map[field] = index;
  }
  const missing = required.filter((field) => map[field] === undefined);
  if (missing.length) throw new Error(`Missing column: ${missing.join(', ')}.`);
  const ignored = grid[headerIndex].filter((h, i) => String(h).trim() && !Object.values(map).includes(i)).map(String);

  const rows = [];
  for (let i = headerIndex + 1; i < grid.length; i += 1) {
    const line = grid[i] || [];
    if (!line.some((v) => String(v ?? '').trim() !== '')) continue;
    const record = { __row: i + 1 };
    for (const [field, index] of Object.entries(map)) record[field] = line[index] ?? '';
    rows.push(record);
  }
  return { rows, matched: Object.keys(map), ignored };
}

// sheets: [{ name, columns: [{ header, key, width, money, date }], rows }]
export async function downloadWorkbook(filename, sheets) {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'StockDesk';
  workbook.created = new Date();
  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(spec.name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = spec.columns.map((c) => ({ header: c.header, key: c.key, width: c.width || Math.max(12, c.header.length + 4) }));
    spec.columns.forEach((c, i) => {
      const column = sheet.getColumn(i + 1);
      if (c.money) column.numFmt = '#,##0.##';
      if (c.date) column.numFmt = 'dd mmm yyyy hh:mm';
    });
    spec.rows.forEach((row) => sheet.addRow(row));
    const head = sheet.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
    head.alignment = { vertical: 'middle' };
    head.height = 20;
    if (spec.rows.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.columns.length } };
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Local date for file names (toISOString would give yesterday's date in
// East Africa between midnight and 3 a.m.).
export const fileDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
