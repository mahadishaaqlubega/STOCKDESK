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

  // ---------------------------------------------------------------- offline
  group('Offline sales & sync');
  const ref = `e2e-${stamp}-${Date.now().toString(36)}`;
  const offlineSale = { items: [{ productId: lastUnit.data.id, quantity: 3 }], paymentMethod: 'Cash', clientRef: ref, offline: true, soldAt: new Date(Date.now() - 2 * 3600000).toISOString(), cashierId: 170 };
  const first = await api('POST', '/sales', admin, offlineSale);
  check('offline sale is accepted even when stock is short', first.status === 201, `${first.status} ${first.data.message || ''}`);
  check('stock may go below zero for offline sales', (await api('GET', `/products/${lastUnit.data.id}`, admin)).data.quantity === -3);
  const resent = await api('POST', '/sales', admin, offlineSale);
  check('sending the same sale again stores it once', resent.status === 200 && resent.data.duplicate === true && resent.data.saleId === first.data.saleId);
  const [raceA, raceB] = await Promise.all([
    api('POST', '/sales', staff, { ...offlineSale, clientRef: `${ref}-race` }),
    api('POST', '/sales', staff, { ...offlineSale, clientRef: `${ref}-race` }),
  ]);
  check('two copies arriving together still make one sale', raceA.data.saleId === raceB.data.saleId && [raceA.status, raceB.status].sort().join() === '200,201', `${raceA.status}/${raceB.status} ${raceA.data.saleId}/${raceB.data.saleId}`);
  const offlineDetail = (await api('GET', `/sales/${first.data.saleId}`, admin)).data;
  check('offline sale keeps the real cashier and time', offlineDetail.cashierId === 170 && Math.abs(new Date(offlineDetail.createdAt) - new Date(offlineSale.soldAt)) < 2000, `${offlineDetail.cashierId} ${offlineDetail.createdAt}`);
  check('credit sales are refused offline', (await api('POST', '/sales', staff, { ...offlineSale, clientRef: `${ref}-cr`, paymentMethod: 'Credit', customerId: cust.data.id })).status === 400);
  check('impossible offline time refused', (await api('POST', '/sales', staff, { ...offlineSale, clientRef: `${ref}-old`, soldAt: '2001-01-01T00:00:00Z' })).status === 400);
  check('bad sale reference refused', (await api('POST', '/sales', staff, { ...offlineSale, clientRef: 'x' })).status === 400);
  check('online sale with a reference is idempotent too', (await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 1 }], paymentMethod: 'Cash', clientRef: `${ref}-on` })).status === 201
    && (await api('POST', '/sales', staff, { items: [{ productId: goodsId, quantity: 1 }], paymentMethod: 'Cash', clientRef: `${ref}-on` })).data.duplicate === true);
  check('online sales still refuse short stock', (await api('POST', '/sales', staff, { items: [{ productId: lastUnit.data.id, quantity: 1 }], paymentMethod: 'Cash' })).status === 409);
  await api('POST', '/stock-reconciliation/create', admin, { productId: lastUnit.data.id, physicalQuantity: 0, reason: 'e2e reset after offline sale' });

  // ---------------------------------------------------------------- receipts
  group('Receipts');
  for (const [label, id] of [['cash', cash.data.saleId], ['split', split.data.saleId], ['service', svcAgreed.data.saleId]]) {
    const pdf = await fetch(`${BASE}/sales/${id}/receipt`, { headers: { Authorization: `Bearer ${admin}` } });
    const buf = Buffer.from(await pdf.arrayBuffer());
    check(`PDF receipt renders (${label})`, pdf.status === 200 && buf.slice(0, 4).toString() === '%PDF', `${pdf.status} ${buf.length}b`);
  }

  // ---------------------------------------------------------------- whatsapp
  group('WhatsApp receipts & reminders');
  const cashDetail = (await api('GET', `/sales/${cash.data.saleId}`, admin)).data;
  check('new sales get a receipt link token', /^[A-Za-z0-9_-]{20,}$/.test(cashDetail.receipt?.publicToken || ''));
  const publicPdf = await fetch(`${BASE}/public/receipts/${cashDetail.receipt?.publicToken}`);
  const publicBuf = Buffer.from(await publicPdf.arrayBuffer());
  check('receipt link opens the PDF without signing in', publicPdf.status === 200 && publicBuf.slice(0, 4).toString() === '%PDF', `${publicPdf.status}`);
  check('made-up receipt link → 404', (await fetch(`${BASE}/public/receipts/AAAAAAAAAAAAAAAAAAAAAAAA`)).status === 404);
  check('malformed receipt link → 404', (await fetch(`${BASE}/public/receipts/${encodeURIComponent("' OR 1=1")}`)).status === 404);
  const shared = await api('POST', `/sales/${cash.data.saleId}/share`, staff);
  check('share returns the same token', shared.status === 200 && shared.data.token === cashDetail.receipt?.publicToken);
  check('cannot share another shop\'s sale', (await api('POST', `/sales/${cash.data.saleId}/share`, otherShopAdmin)).status === 404);
  const waEdit = await api('PUT', `/customers/${cust.data.id}`, staff, { name: cust.data.name, phone: '+256700111222', whatsapp: '0772 123456' });
  check('customer WhatsApp number saved', waEdit.data.whatsapp === '0772 123456');

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
  const reminded = await api('POST', `/customers/${cust.data.id}/reminders`, staff, { channel: 'whatsapp', balance: 25000 });
  check('debt reminder recorded', reminded.status === 200 && reminded.data.lastReminderAt);
  check('reminder for another shop\'s customer → 404', (await api('POST', `/customers/${cust.data.id}/reminders`, otherShopAdmin, {})).status === 404);
  const statement = await api('GET', `/customers/${cust.data.id}/credit`, staff);
  check('statement shows when last reminded', Boolean(statement.data.customer?.lastReminderAt));
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

  // ---------------------------------------------------------------- suppliers
  group('Suppliers & purchases');
  check('staff cannot open suppliers', (await api('GET', '/suppliers', staff)).status === 403);
  check('supplier needs a name', (await api('POST', '/suppliers', admin, { phone: '0700' })).status === 400);
  const supplier = await api('POST', '/suppliers', admin, { name: `E2E Wholesaler ${stamp}`, phone: '0772000999' });
  check('create supplier', supplier.status === 201);
  const stockItem = await api('POST', '/products', admin, { name: `E2E Bought item ${stamp}`, category: 'E2E-Buy', buyPrice: 5000, sellPrice: 9000, quantity: 2, lowStock: 1 });
  const purchase = await api('POST', '/purchases', admin, {
    supplierId: supplier.data.id,
    reference: 'INV-77',
    items: [{ productId: stockItem.data.id, quantity: 5, unitCost: 7000, sellPrice: 12000 }],
    amountPaid: 20000,
    paymentMethod: 'Mobile Money',
    dueDate: '2030-02-01',
  });
  check('record purchase: total 35,000, owe 15,000', purchase.status === 201 && Number(purchase.data.total) === 35000 && Number(purchase.data.balanceDue) === 15000, `${purchase.status} ${purchase.data.message || purchase.data.total}`);
  const bought = (await api('GET', `/products/${stockItem.data.id}`, admin)).data;
  check('purchase adds stock and updates cost and price', bought.quantity === 7 && Number(bought.buyPrice) === 7000 && Number(bought.sellPrice) === 12000, `${bought.quantity} ${bought.buyPrice} ${bought.sellPrice}`);
  const history = (await api('GET', `/products/${stockItem.data.id}/stock-history`, admin)).data;
  check('stock history shows the delivery', history.some((h) => h.purchaseId === purchase.data.id && h.supplier === supplier.data.name));
  check('services cannot be purchased into stock', (await api('POST', '/purchases', admin, { supplierId: supplier.data.id, items: [{ productId: pricedService.data.id, quantity: 1, unitCost: 1 }] })).status === 400);
  check('paying more than the total refused', (await api('POST', '/purchases', admin, { supplierId: supplier.data.id, items: [{ productId: stockItem.data.id, quantity: 1, unitCost: 100 }], amountPaid: 500 })).status === 400);
  check('fractional quantity refused', (await api('POST', '/purchases', admin, { supplierId: supplier.data.id, items: [{ productId: stockItem.data.id, quantity: 0.5, unitCost: 100 }] })).status === 400);
  check('another shop cannot use this supplier', (await api('POST', '/purchases', otherShopAdmin, { supplierId: supplier.data.id, items: [{ productId: stockItem.data.id, quantity: 1, unitCost: 1 }] })).status === 404);
  check('another shop cannot see this purchase', (await api('GET', `/purchases/${purchase.data.id}`, otherShopAdmin)).status === 404);
  const supplierRow = (await api('GET', '/suppliers', admin)).data.find((x) => x.id === supplier.data.id);
  check('supplier list shows what is owed', supplierRow && supplierRow.balance === 15000 && supplierRow.purchased === 35000, JSON.stringify(supplierRow || {}).slice(0, 120));
  check('overpaying a supplier refused', (await api('POST', `/suppliers/${supplier.data.id}/payments`, admin, { amount: 20000, method: 'Cash' })).status === 400);
  const supplierPaid = await api('POST', `/suppliers/${supplier.data.id}/payments`, admin, { amount: 10000, method: 'Bank', notes: 'e2e' });
  check('pay supplier part of the balance', supplierPaid.status === 201 && supplierPaid.data.balance === 5000, `${supplierPaid.status} ${supplierPaid.data.balance}`);
  const supStatement = (await api('GET', `/suppliers/${supplier.data.id}/statement`, admin)).data;
  check('supplier statement: balance and payments', supStatement.balance === 5000 && supStatement.payments.length === 1 && supStatement.openPurchases.length === 1);
  const purchaseDetail = (await api('GET', `/purchases/${purchase.data.id}`, admin)).data;
  check('purchase detail lists items and payments', purchaseDetail.items?.length === 1 && purchaseDetail.payments?.length === 1);
  check('purchases list loads', (await api('GET', '/purchases?limit=5', admin)).data.length >= 1);
  const removeSupplier = await api('DELETE', `/suppliers/${supplier.data.id}`, admin);
  check('supplier with purchases is archived, not deleted', removeSupplier.status === 200 && removeSupplier.data.archived === true);

  // ---------------------------------------------------------------- excel
  group('Excel import & export');
  check('staff cannot import', (await api('POST', '/import/products', staff, { rows: [{ name: 'x', sellPrice: 1 }] })).status === 403);
  const beforeCount = (await api('GET', '/products?includeArchived=1', admin)).data.length;
  const importRows = [
    { __row: 2, name: `E2E Imported cable ${stamp}`, category: 'Cables', sku: `IMP-${stamp}`, type: 'goods', buyPrice: '2,000', sellPrice: 'UGX 3,500', quantity: 12, lowStock: 2 },
    { __row: 3, name: stockItem.data.name, sellPrice: 15000, quantity: 99 },
    { __row: 4, name: `E2E Imported labour ${stamp}`, type: 'Service', sellPrice: '' },
  ];
  const dry = await api('POST', '/import/products', admin, { rows: importRows, dryRun: true });
  check('preview: 2 new, 1 update, nothing saved', dry.status === 200 && dry.data.created === 2 && dry.data.updated === 1 && dry.data.errorCount === 0 && (await api('GET', '/products?includeArchived=1', admin)).data.length === beforeCount, JSON.stringify(dry.data).slice(0, 160));
  const withErrors = await api('POST', '/import/products', admin, { rows: [...importRows, { __row: 5, name: '', sellPrice: 1 }, { __row: 6, name: 'Bad price', sellPrice: 'abc' }, { __row: 7, name: `E2E Imported cable ${stamp}`, sku: `IMP-${stamp}`, sellPrice: 1 }], dryRun: false });
  check('any bad row blocks the whole import', withErrors.data.saved === false && withErrors.data.errorCount === 3 && (await api('GET', '/products?includeArchived=1', admin)).data.length === beforeCount, JSON.stringify(withErrors.data.rows?.slice(0, 3)));
  const imported = await api('POST', '/import/products', admin, { rows: importRows, dryRun: false });
  check('import saves new and updated products', imported.status === 201 && imported.data.saved && (await api('GET', '/products?includeArchived=1', admin)).data.length === beforeCount + 2);
  const importedItem = (await api('GET', `/products/${stockItem.data.id}`, admin)).data;
  check('update changes price but leaves stock alone', Number(importedItem.sellPrice) === 15000 && importedItem.quantity === bought.quantity, `${importedItem.sellPrice} ${importedItem.quantity}`);
  const cable = (await api('GET', `/products?search=${encodeURIComponent(`E2E Imported cable ${stamp}`)}`, admin)).data[0];
  check('amounts like "UGX 3,500" are understood', cable && Number(cable.sellPrice) === 3500 && Number(cable.buyPrice) === 2000 && cable.quantity === 12);
  const stockSync = await api('POST', '/import/products', admin, { rows: [{ name: stockItem.data.name, quantity: 4 }], dryRun: false, updateStock: true });
  check('"set stock" option updates quantities', stockSync.data.saved && (await api('GET', `/products/${stockItem.data.id}`, admin)).data.quantity === 4);
  check('import is idempotent (re-import = no change)', (await api('POST', '/import/products', admin, { rows: importRows.slice(0, 1), dryRun: true })).data.unchanged === 1);
  const newPhone = `0709${String(Date.now()).slice(-6)}`;
  const custImport = await api('POST', '/import/customers', admin, { rows: [
    { name: `E2E Imported customer ${stamp}`, phone: newPhone },
    { name: 'Renamed by phone', phone: '+256 700 111 222', email: 'grace@example.com' },
    { name: 'Bad email', email: 'not-an-email' },
  ], dryRun: true });
  check('customer preview: new, matched by phone, bad email', custImport.data.created === 1 && custImport.data.updated === 1 && custImport.data.errorCount === 1, JSON.stringify(custImport.data).slice(0, 160));
  const custSaved = await api('POST', '/import/customers', admin, { rows: [{ name: `E2E Imported customer ${stamp}`, phone: newPhone }], dryRun: false });
  check('customer import saves', custSaved.status === 201 && custSaved.data.created === 1);
  check('sales export needs dates', (await api('GET', '/exports/sales', admin)).status === 400);
  const tz = new Date().getTimezoneOffset();
  const exportRows = await api('GET', `/exports/sales?start=${iso}&end=${iso}&tz=${tz}`, admin);
  check('sales export lists today\'s items with profit inputs', exportRows.status === 200 && exportRows.data.rows.length > 5 && 'lineCost' in exportRows.data.rows[0] && 'listPrice' in exportRows.data.rows[0]);
  check('another shop sees none of these sales', !(await api('GET', `/exports/sales?start=${iso}&end=${iso}&tz=${tz}`, otherShopAdmin)).data.rows.some((r) => r.receiptNumber === cashDetail.receipt?.receiptNumber));

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
