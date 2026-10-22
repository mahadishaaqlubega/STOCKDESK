// End-to-end test of every StockDesk feature against a real backend running
// on a restored copy of production data (port 4200, database stockdesk_e2e).
const jwt = require(require('path').join(__dirname, '../../backend/node_modules/jsonwebtoken'));

const BASE = process.env.QA_API || 'http://localhost:4200/api';
const SECRET = process.env.QA_JWT_SECRET || 'e2e-secret';
const sign = (payload) => jwt.sign(payload, SECRET, { expiresIn: '2h' });
const admin = sign({ id: 94, role: 'Admin', shopId: 34 });
const staff = sign({ id: 170, role: 'Staff', shopId: 34 });
const otherShopAdmin = sign({ id: 213, role: 'Admin', shopId: 98 });
const owner = sign({ id: 141, role: 'SuperAdmin', shopId: null });

const results = [];
let section = '';
function group(name) { section = name; }
function check(name, ok, detail = '') {
  results.push({ section, name, ok: Boolean(ok), detail });
}

async function api(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* binary or text */ }
  return { status: res.status, data, raw: text, headers: res.headers };
}

const stamp = Date.now().toString(36);

(async () => {
  // ---------------------------------------------------------------- access
  group('Access control');
  check('health check is up', (await api('GET', '')).status === 200);
  check('no token → 401', (await api('GET', '/products')).status === 401);
  check('garbage token → 401', (await api('GET', '/products', 'nope')).status === 401);
  check('staff cannot open team admin → 403', (await api('GET', '/users', staff)).status === 403);
  check('shop admin cannot open platform console → 403', (await api('GET', '/admin/overview', admin)).status === 403);

  // ---------------------------------------------------------------- team + login
  group('Team & sign-in');
  const username = `e2e${stamp}`;
  const password = 'Strong#Pass1';
  const createdUser = await api('POST', '/users', admin, { name: 'E2E Cashier', username, password, confirmPassword: password, role: 'Cashier', displayRole: 'Cashier' });
  check('admin creates cashier', createdUser.status === 201, createdUser.data.message);
  const shopName = (await api('GET', '/settings', admin)).data?.shop?.name || 'gsmtech msk';
  const login = await api('POST', '/auth/login', null, { shopName, username, password });
  check('new cashier can sign in with shop name', login.status === 200 && login.data.token, `${login.status} ${login.data.message || ''}`);
  const badLogin = await api('POST', '/auth/login', null, { shopName, username, password: 'wrong' });
  check('wrong password rejected', badLogin.status === 401);
  check('weak password refused for new staff', (await api('POST', '/users', admin, { username: `${username}w`, password: 'abc', confirmPassword: 'abc', role: 'Cashier' })).status === 400);
  const oldSession = login.data.token;
  check('cashier session works before reset', (await api('GET', '/products?limit=1', oldSession)).status === 200);
  const reset = await api('POST', `/users/${createdUser.data.id}/reset-password`, admin, { password: 'Newer#Pass2', confirmPassword: 'Newer#Pass2' });
  check('admin resets password', reset.status === 200, reset.data.message);
  check('reset signs the old session out', (await api('GET', '/products?limit=1', oldSession)).status === 401);
  check('shop name "%" does not match any shop', (await api('POST', '/auth/login', null, { shopName: '%', username, password: 'Newer#Pass2' })).status === 401);
  check('signs in with new password', (await api('POST', '/auth/login', null, { shopName, username, password: 'Newer#Pass2' })).status === 200);
  const userList = await api('GET', '/users', admin);
  check('team list shows email + verification fields', Array.isArray(userList.data) && 'isVerified' in (userList.data[0] || {}));
  check('admin removes cashier', (await api('DELETE', `/users/${createdUser.data.id}`, admin)).status === 204);

  // ---------------------------------------------------------------- settings
  group('Settings & logo');
  const before = (await api('GET', '/settings', admin)).data;
  const attack = await api('PUT', '/settings', admin, { shopId: 98, receiptFooter: 'Thanks e2e' });
  check('cannot move settings to another shop', attack.status === 200 && attack.data.shopId === 34);
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  check('uploaded PNG logo accepted', (await api('PUT', '/settings', admin, { shopLogoUrl: tinyPng })).status === 200);
  check('non-image logo rejected', (await api('PUT', '/settings', admin, { shopLogoUrl: 'javascript:alert(1)' })).status === 400);
  check('oversized logo rejected', (await api('PUT', '/settings', admin, { shopLogoUrl: `data:image/png;base64,${'A'.repeat(450000)}` })).status === 400);
  check('staff cannot change settings', (await api('PUT', '/settings', staff, { receiptFooter: 'x' })).status === 403);

  // ---------------------------------------------------------------- products
  group('Products & services');
  const goods = await api('POST', '/products', admin, { name: `E2E Charger ${stamp}`, category: 'E2E', buyPrice: 6000, sellPrice: 10000, quantity: 10, lowStock: 2 });
  check('create goods', goods.status === 201 && goods.data.type === 'goods');
  const lastUnit = await api('POST', '/products', admin, { name: `E2E Last unit ${stamp}`, category: 'E2E-Single', buyPrice: 1000, sellPrice: 2000, quantity: 1, lowStock: 0 });
  const pricedService = await api('POST', '/products', admin, { name: `E2E Screen fix ${stamp}`, category: 'Labour', buyPrice: 0, sellPrice: 25000, quantity: 99, type: 'service' });
  check('create priced service (stock forced to 0)', pricedService.status === 201 && pricedService.data.quantity === 0);
  const openService = await api('POST', '/products', admin, { name: `E2E Repair ${stamp}`, category: 'Labour', buyPrice: 0, sellPrice: 0, type: 'service' });
  check('create service with price set at checkout', openService.status === 201 && Number(openService.data.sellPrice) === 0);
  check('update product price', (await api('PUT', `/products/${goods.data.id}`, admin, { sellPrice: 12000 })).data.sellPrice == 12000);
  check('cannot reassign product to another shop', (await api('PUT', `/products/${goods.data.id}`, admin, { shopId: 98 })).data.shopId === 34);
  const restock = await api('POST', `/products/${goods.data.id}/restock`, admin, { quantity: 5, costPrice: 6500, supplier: 'E2E Ltd' });
  check('restock adds units', restock.status === 201 && restock.data.newQuantity === 15, JSON.stringify(restock.data).slice(0, 80));
  check('restocking a service is refused', (await api('POST', `/products/${pricedService.data.id}/restock`, admin, { quantity: 5 })).status === 400);
  check('stock history recorded', (await api('GET', `/products/${goods.data.id}/stock-history`, admin)).data.length >= 1);
  const catRestock = await api('POST', '/products/restock-category', admin, { category: 'E2E', quantity: 1 });
  check('category restock updates goods only', catRestock.status === 200 && catRestock.data.updated === 1, JSON.stringify(catRestock.data).slice(0, 80));
  const low = await api('GET', '/products/low-stock', admin);
  check('services never appear as low stock', !low.data.some((p) => p.type === 'service'));
  check('staff cannot create products', (await api('POST', '/products', staff, { name: 'x', category: 'x', buyPrice: 1, sellPrice: 1 })).status === 403);

  // ---------------------------------------------------------------- customers
  group('Customers');
  const cust = await api('POST', '/customers', admin, { name: `E2E Customer ${stamp}`, phone: '+256700111222', creditLimit: 100000 });
  check('create customer with credit limit', cust.status === 201 && Number(cust.data.creditLimit) === 100000);
  const staffEdit = await api('PUT', `/customers/${cust.data.id}`, staff, { name: cust.data.name, phone: '+256700111222', creditLimit: 9e9 });
  check('staff cannot raise credit limit', Number(staffEdit.data.creditLimit) === 100000);

  // ---------------------------------------------------------------- sales
  group('Sales & checkout');
  const goodsId = goods.data.id;
  const cash = await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 2 }], paymentMethod: 'Cash' });
  check('cash sale', cash.status === 201 && cash.data.total === 24000, `${cash.status} ${cash.data.total}`);
  const belowCost = await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 1, price: 1 }], paymentMethod: 'Cash' });
  check('staff cannot sell goods below cost', belowCost.status === 403, `${belowCost.status} ${belowCost.data.message || ''}`);
  check('goods cannot be sold above catalogue price', (await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 1, price: 13000 }], paymentMethod: 'Cash' })).status === 400);
  const itemDisc = await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 2, price: 11000 }], paymentMethod: 'Cash' });
  check('per-item discount: sold at 11,000 of 12,000', itemDisc.status === 201 && itemDisc.data.total === 22000 && itemDisc.data.itemDiscounts === 2000, `${itemDisc.status} ${itemDisc.data.total} ${itemDisc.data.itemDiscounts}`);
  const discLine = (await api('GET', `/sales/${itemDisc.data.saleId}`, admin)).data.items?.[0];
  check('sale line keeps catalogue and charged price', Number(discLine?.listPrice) === 12000 && Number(discLine?.price) === 11000, JSON.stringify(discLine || {}).slice(0, 80));
  await api('PUT', '/settings', admin, { maxDiscountPercent: 5 });
  check('staff over the 5% limit refused', (await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 1, price: 11000 }], paymentMethod: 'Cash' })).status === 403);
  check('staff within the 5% limit allowed', (await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 1, price: 11500 }], paymentMethod: 'Cash' })).status === 201);
  check('sale-wide discount counts toward the limit', (await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 1 }], paymentMethod: 'Cash', discount: 10, discountType: 'percentage' })).status === 403);
  check('admin is not limited', (await api('POST', '/sales', admin, { items: [{ productId: goodsId, quantity: 1, price: 6000 }], paymentMethod: 'Cash' })).status === 201);
  check('invalid limit refused', (await api('PUT', '/settings', admin, { maxDiscountPercent: 150 })).status === 400);
  await api('PUT', '/settings', admin, { maxDiscountPercent: before.maxDiscountPercent ?? null });
  const svcPriced = await api('POST', '/sales', staff, { items: [{ productId: pricedService.data.id, quantity: 1 }], paymentMethod: 'Mobile Money' });
  check('priced service sells at its price', svcPriced.data.total === 25000);
  const svcAgreed = await api('POST', '/sales', staff, { items: [{ productId: openService.data.id, quantity: 1, price: 35000 }], paymentMethod: 'Cash' });
  check('open-price service charged at agreed amount', svcAgreed.status === 201 && svcAgreed.data.total === 35000, `${svcAgreed.status} ${svcAgreed.data.message || svcAgreed.data.total}`);
  check('open-price service without amount is refused', (await api('POST', '/sales', staff, { items: [{ productId: openService.data.id, quantity: 1 }], paymentMethod: 'Cash' })).status === 400);
  const pct = await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 1 }], paymentMethod: 'Card', discount: 10, discountType: 'percentage' });
  check('10% discount applied', pct.data.total === 10800, `total ${pct.data.total}`);
  check('discount over 100% refused', (await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 1 }], paymentMethod: 'Cash', discount: 150, discountType: 'percentage' })).status === 400);
  const split = await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 1 }], paymentMethod: 'Split', paymentSplits: [{ method: 'Cash', amount: 7000 }, { method: 'Mobile Money', amount: 5000 }] });
  check('split payment sale', split.status === 201);
  check('invalid payment method refused', (await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 1 }], paymentMethod: 'Bitcoin' })).status === 400);
  check('fractional quantity refused', (await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 1.5 }], paymentMethod: 'Cash' })).status === 400);
  const tooMany = await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 999 }], paymentMethod: 'Cash' });
  check('insufficient stock → 409 with clear message', tooMany.status === 409 && /left/.test(tooMany.data.message), tooMany.data.message);

  await api('PUT', '/settings', admin, { vat: 18 });
  const vatSale = await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 1 }], paymentMethod: 'Cash' });
  check('VAT 18% added on top', vatSale.data.taxAmount === 2160 && vatSale.data.total === 14160, `${vatSale.data.taxAmount}/${vatSale.data.total}`);
  await api('PUT', '/settings', admin, { vat: before.vat || 0, receiptFooter: before.receiptFooter || '', shopLogoUrl: before.shopLogoUrl || '' });

  const [a, b] = await Promise.all([
    api('POST', '/sales', staff, { items: [{ productId: lastUnit.data.id, quantity: 1 }], paymentMethod: 'Cash' }),
    api('POST', '/sales', admin, { items: [{ productId: lastUnit.data.id, quantity: 1 }], paymentMethod: 'Cash' }),
  ]);
  const stockAfter = (await api('GET', `/products/${lastUnit.data.id}`, admin)).data.quantity;
  check('two tills cannot both sell the last unit', [a.status, b.status].sort().join() === '201,409' && stockAfter === 0, `${a.status},${b.status} stock=${stockAfter}`);
  check('sale detail loads with items', (await api('GET', `/sales/${cash.data.saleId}`, admin)).data.items?.length === 1);
  check('bad sale id → 404 not 500', (await api('GET', '/sales/abc/receipt', admin)).status === 404);

  // ---------------------------------------------------------------- receipts
  group('Receipts');
  for (const [label, id] of [['cash', cash.data.saleId], ['split', split.data.saleId], ['service', svcAgreed.data.saleId]]) {
    const pdf = await fetch(`${BASE}/sales/${id}/receipt`, { headers: { Authorization: `Bearer ${admin}` } });
    const buf = Buffer.from(await pdf.arrayBuffer());
    check(`PDF receipt renders (${label})`, pdf.status === 200 && buf.slice(0, 4).toString() === '%PDF', `${pdf.status} ${buf.length}b`);
  }

  // ---------------------------------------------------------------- credit
  group('Credit');
  check('credit needs a named customer', (await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 1 }], paymentMethod: 'Credit' })).status === 400);
  const credit = await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 2 }, { productId: pricedService.data.id, quantity: 1 }], paymentMethod: 'Credit', customerId: cust.data.id, amountPaid: 9000, depositMethod: 'Mobile Money', dueDate: '2030-01-31' });
  check('credit sale with deposit', credit.status === 201 && credit.data.balanceDue === 40000, `${credit.status} due ${credit.data.balanceDue}`);
  const creditPdf = await fetch(`${BASE}/sales/${credit.data.saleId}/receipt`, { headers: { Authorization: `Bearer ${admin}` } });
  check('credit PDF receipt renders', creditPdf.status === 200);
  check('credit limit enforced', (await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 6 }], paymentMethod: 'Credit', customerId: cust.data.id })).status === 409);
  check('full deposit is not a credit sale', (await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 1 }], paymentMethod: 'Credit', customerId: cust.data.id, amountPaid: 12000 })).status === 400);
  const summary = await api('GET', '/credit/summary', staff);
  check('debtor listed in credit summary', summary.data.debtors?.some((d) => d.customerId === cust.data.id && d.balance === 40000));
  check('overpayment refused', (await api('POST', `/customers/${cust.data.id}/payments`, staff, { amount: 50000, method: 'Cash' })).status === 400);
  const pay = await api('POST', `/customers/${cust.data.id}/payments`, staff, { amount: 15000, method: 'Cash' });
  check('partial repayment', pay.status === 201 && pay.data.balance === 25000);
  const statement = await api('GET', `/customers/${cust.data.id}/credit`, staff);
  check('statement shows balance, payments, available credit', statement.data.balance === 25000 && statement.data.payments.length === 1 && statement.data.availableCredit === 75000);

  // ---------------------------------------------------------------- returns
  group('Returns');
  const ret = await api('POST', `/sales/${credit.data.saleId}/return`, admin, { items: [{ productId: pricedService.data.id, quantity: 1 }], reason: 'e2e' });
  check('return on credit sale reduces debt first', ret.status === 201 && ret.data.creditReduction === 25000 && ret.data.cashRefund === 0, JSON.stringify(ret.data).slice(0, 100));
  check('same item cannot be returned twice', (await api('POST', `/sales/${credit.data.saleId}/return`, admin, { items: [{ productId: pricedService.data.id, quantity: 1 }] })).status === 400);
  const stockBeforeReturn = (await api('GET', `/products/${goodsId}`, admin)).data.quantity;
  const cashReturn = await api('POST', `/sales/${cash.data.saleId}/return`, admin, { items: [{ productId: goodsId, quantity: 1 }] });
  const stockAfterReturn = (await api('GET', `/products/${goodsId}`, admin)).data.quantity;
  check('cash return refunds and restocks', cashReturn.data.cashRefund === 12000 && stockAfterReturn === stockBeforeReturn + 1, `${cashReturn.data.cashRefund} ${stockBeforeReturn}->${stockAfterReturn}`);
  check('returns history lists it', (await api('GET', '/sales/returns', admin)).data.some((r) => r.id === cashReturn.data.returnId));
  check('staff cannot process returns', (await api('POST', `/sales/${cash.data.saleId}/return`, staff, { items: [{ productId: goodsId, quantity: 1 }] })).status === 403);
  const paid = await api('POST', `/customers/${cust.data.id}/payments`, staff, { amount: 0.01, method: 'Cash' });
  check('debt cleared after return (nothing left to pay)', paid.status === 400);

  // ---------------------------------------------------------------- expenses
  group('Expenses');
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const exp = await api('POST', '/expenses', admin, { category: 'Transport', description: 'E2E boda', amount: 5000, date: iso });
  check('record expense', exp.status === 201, exp.data.message);
  check('expense listed for today', (await api('GET', `/expenses?start=${iso}&end=${iso}`, admin)).data.some((e) => e.id === exp.data.id));
  check('edit expense', Number((await api('PUT', `/expenses/${exp.data.id}`, admin, { amount: 6000 })).data.amount) === 6000);
  check('expense without description refused', (await api('POST', '/expenses', admin, { category: 'Rent', amount: 1, date: iso })).status === 400);
  check('delete expense', (await api('DELETE', `/expenses/${exp.data.id}`, admin)).status === 200);

  // ---------------------------------------------------------------- stock count
  group('Stock count');
  const recon = await api('POST', '/stock-reconciliation/create', admin, { productId: goodsId, physicalQuantity: 3, reason: 'Theft / loss' });
  check('record count adjusts stock', recon.status === 201 && (await api('GET', `/products/${goodsId}`, admin)).data.quantity === 3, recon.data.message);
  check('negative count refused', (await api('POST', '/stock-reconciliation/create', admin, { productId: goodsId, physicalQuantity: -1 })).status === 400);
  check('counting a service refused', (await api('POST', '/stock-reconciliation/create', admin, { productId: pricedService.data.id, physicalQuantity: 1 })).status === 400);
  check('count history loads', (await api('GET', '/stock-reconciliation/history?limit=5', admin)).status === 200);
  check('count summary loads (was always failing)', (await api('GET', '/stock-reconciliation/summary', admin)).status === 200);

  // ---------------------------------------------------------------- reports
  group('Reports & day close');
  const rep = await api('GET', '/reports/summary', admin);
  check('summary has refunds and credit figures', rep.status === 200 && 'refundTotal' in rep.data.periods.today && 'creditCollected' in rep.data.periods.today);
  const ds = await api('GET', '/reports/dashboard-stats', admin);
  check('dashboard stats split low vs out of stock', 'outOfStockCount' in (ds.data.products || {}));
  check('best sellers load', Array.isArray((await api('GET', '/reports/best-selling', admin)).data));
  const range = await api('GET', `/reports/range?start=${iso}&end=${iso}`, admin);
  check('range report loads', range.status === 200, range.data.message);
  const closeDay = await api('POST', '/sales/close-day', admin);
  check('close business day', [200, 201, 400, 409].includes(closeDay.status), `${closeDay.status} ${closeDay.data.message}`);
  check('day closures listed', Array.isArray((await api('GET', '/sales/day-closures', admin)).data));

  // ---------------------------------------------------------------- audit
  group('Activity log');
  const logs = await api('GET', '/audit/logs?limit=50', admin);
  check('sales and payments are logged', logs.data.data?.some((l) => l.entityType === 'SALE') && logs.data.data?.some((l) => l.entityType === 'CREDIT_PAYMENT'));
  check('activity stats load', (await api('GET', '/audit/stats', admin)).status === 200);

  // ---------------------------------------------------------------- isolation
  group('Shop isolation');
  check('other shop cannot read this sale', (await api('GET', `/sales/${cash.data.saleId}`, otherShopAdmin)).status === 404);
  check('other shop cannot read this customer', (await api('GET', `/customers/${cust.data.id}`, otherShopAdmin)).status === 404);
  check('other shop cannot edit this product', (await api('PUT', `/products/${goodsId}`, otherShopAdmin, { sellPrice: 1 })).status === 404);
  check('other shop cannot take payments for this customer', (await api('POST', `/customers/${cust.data.id}/payments`, otherShopAdmin, { amount: 1, method: 'Cash' })).status === 404);
  check("other shop's product list excludes ours", !(await api('GET', '/products', otherShopAdmin)).data.some((p) => p.id === goodsId));

  // ---------------------------------------------------------------- platform
  group('Platform console');
  check('overview loads with owners', (await api('GET', '/admin/overview', owner)).data.shops?.some((s) => s.owner));
  check('dashboard loads', (await api('GET', '/admin/dashboard?days=30', owner)).data.trendDays === 30);
  check('shops directory loads', (await api('GET', '/admin/shops', owner)).status === 200);
  check('shop detail loads', (await api('GET', '/admin/shops/34', owner)).data.id === 34);

  // ---------------------------------------------------------------- printer
  group('Printing');
  const ps = await api('GET', '/printer/status', admin);
  check('server printer endpoint answers without crashing', ps.status < 500, `${ps.status}`);

  // ---------------------------------------------------------------- scale-safety
  group('Lists at scale');
  const page = await api('GET', '/sales?limit=5', admin);
  check('sales list is paged', Array.isArray(page.data) && page.data.length === 5);
  const byReceipt = await api('GET', `/sales?q=SD-${String(cash.data.saleId).padStart(6, '0')}`, admin);
  check('sales searchable by receipt number', byReceipt.data.length === 1 && byReceipt.data[0].id === cash.data.saleId);
  const byCustomer = await api('GET', `/sales?q=${encodeURIComponent(cust.data.name)}`, admin);
  check('sales searchable by customer name', byCustomer.data.some((sl) => sl.id === credit.data.saleId));
  const archived = await api('DELETE', `/products/${goodsId}`, admin);
  check('deleting a sold product archives it (no error)', archived.status === 200 && archived.data.archived === true, `${archived.status}`);
  check('archived product hidden from catalogue', !(await api('GET', '/products', admin)).data.some((p) => p.id === goodsId));
  const gz = await fetch(`${BASE}/products`, { headers: { Authorization: `Bearer ${admin}`, 'Accept-Encoding': 'gzip' } });
  check('API responses are gzip-compressed', gz.headers.get('content-encoding') === 'gzip');

  // ---------------------------------------------------------------- cleanup
  for (const p of [goods, lastUnit, pricedService, openService]) await api('DELETE', `/products/${p.data.id}`, admin);

  // ---------------------------------------------------------------- report
  let current = '';
  for (const r of results) {
    if (r.section !== current) { current = r.section; console.log(`\n${current}`); }
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${!r.ok && r.detail ? `   [${r.detail}]` : ''}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed${failed ? ` — ${failed} FAILED` : ''}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
