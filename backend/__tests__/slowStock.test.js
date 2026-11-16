require('./setup');
const request = require('supertest');
const app = require('../src/app');
const sequelize = require('../src/config/db');
const { adminToken, staffToken, mockAuthUsers } = require('./helpers');

beforeAll(() => mockAuthUsers());

describe('GET /api/reports/slow-stock', () => {
  let query;
  const rows = [
    { id: 4, name: 'Umbrella', category: 'Household', quantity: 20, buyPrice: '15000.00', sellPrice: '20000.00', createdAt: '2026-05-01T08:00:00Z', lastSold: null },
    { id: 9, name: 'Torch', category: 'Household', quantity: 6, buyPrice: '8000.00', sellPrice: '12000.00', createdAt: '2026-02-01T08:00:00Z', lastSold: '2026-08-01T10:00:00Z' },
  ];

  beforeEach(() => {
    query = jest.spyOn(sequelize, 'query').mockResolvedValue(rows);
  });
  afterEach(() => query.mockRestore());

  it('is for admins only', async () => {
    const res = await request(app).get('/api/reports/slow-stock').set('Authorization', `Bearer ${staffToken()}`);
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(['abc', '3', '400', '30.5'])('rejects days=%s', async (days) => {
    const res = await request(app).get(`/api/reports/slow-stock?days=${days}`).set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it('values the stock and adds up the totals', async () => {
    const res = await request(app).get('/api/reports/slow-stock?days=90').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ days: 90, count: 2, units: 26, stockValue: 348000, sellValue: 472000, truncated: false });
    expect(res.body.items[0]).toEqual({
      id: 4, name: 'Umbrella', category: 'Household', quantity: 20, stockValue: 300000, sellValue: 400000, lastSold: null, addedAt: '2026-05-01T08:00:00Z',
    });
  });

  it('defaults to 60 days and only reads this shop', async () => {
    const before = Date.now();
    const res = await request(app).get('/api/reports/slow-stock').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.body.days).toBe(60);
    const [sql, options] = query.mock.calls[0];
    expect(options.replacements.shopId).toBe(10);
    const cutoffAgeDays = (before - options.replacements.cutoff.getTime()) / 86400000;
    expect(Math.round(cutoffAgeDays)).toBe(60);
    expect(sql).toMatch(/p\."type" = 'goods'/);
    expect(sql).toMatch(/p\.quantity > 0/);
    expect(sql).toMatch(/COALESCE\(ls\."lastSold", p\."createdAt"\) < :cutoff/);
  });
});
