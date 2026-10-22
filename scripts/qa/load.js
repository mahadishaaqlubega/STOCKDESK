// Load test against the big seeded shop (shop 34) on the e2e backend.
const jwt = require(require('path').join(__dirname, '../../backend/node_modules/jsonwebtoken'));
const BASE = process.env.QA_API || 'http://localhost:4200/api';
const token = jwt.sign({ id: 94, role: 'Admin', shopId: 34 }, (process.env.QA_JWT_SECRET || 'e2e-secret'), { expiresIn: '2h' });
// Distinct sessions so the per-session rate limit (120/min) is not what we measure.
const tokens = Array.from({ length: 12 }, (_, i) => jwt.sign({ id: 94, role: 'Admin', shopId: 34, n: i }, (process.env.QA_JWT_SECRET || 'e2e-secret'), { expiresIn: '2h' }));

async function timed(method, path, body, t = token) {
  const start = performance.now();
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: body ? JSON.stringify(body) : undefined });
  const buf = await res.arrayBuffer();
  return { ms: performance.now() - start, status: res.status, bytes: buf.byteLength };
}

function pct(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function run(label, path, { total = 40, concurrency = 10, method = 'GET', body } = {}) {
  const times = [];
  const statuses = {};
  let bytes = 0;
  let next = 0;
  const worker = async (w) => {
    while (next < total) {
      next += 1;
      const r = await timed(method, path, typeof body === 'function' ? body() : body, tokens[w % tokens.length]);
      times.push(r.ms);
      statuses[r.status] = (statuses[r.status] || 0) + 1;
      bytes = r.bytes;
    }
  };
  const t0 = performance.now();
  await Promise.all(Array.from({ length: concurrency }, (_, w) => worker(w)));
  const wall = (performance.now() - t0) / 1000;
  console.log(`${label.padEnd(30)} p50 ${pct(times, 50).toFixed(0).padStart(5)} ms   p95 ${pct(times, 95).toFixed(0).padStart(5)} ms   ${(total / wall).toFixed(1).padStart(6)} req/s   ${(bytes / 1024).toFixed(0).padStart(6)} KB   ${JSON.stringify(statuses)}`);
}

(async () => {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  console.log('Screen loads (40 requests, 10 at a time)\n');
  await run('Products list', '/products');
  await run('Customers list (+balances)', '/customers');
  await run('Sales list (Returns page)', '/sales');
  await run('Dashboard summary', '/reports/summary');
  await run('Dashboard stock stats', '/reports/dashboard-stats');
  await run('Best sellers', '/reports/best-selling');
  await run('Range report (30 days)', `/reports/range?start=${monthAgo}&end=${today}`);
  await run('Credit summary', '/credit/summary');
  await run('Activity log page', '/audit/logs?limit=50');
  await run('Expenses', '/expenses');
  const products = await (await fetch(`${BASE}/products?search=Load%20Product%201`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const ids = products.slice(0, 10).map((p) => p.id);
  console.log('\nCheckout under load (50 sales, 25 at the same moment)\n');
  let i = 0;
  await run('Create sale', '/sales', { total: 50, concurrency: 25, method: 'POST', body: () => ({ items: [{ productId: ids[(i += 1) % ids.length], quantity: 1 }, { productId: ids[(i + 3) % ids.length], quantity: 2 }], paymentMethod: 'Cash' }) });
})();
