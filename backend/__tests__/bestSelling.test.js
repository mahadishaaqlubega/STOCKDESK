require('./setup');
const request = require('supertest');
const app = require('../src/app');
const sequelize = require('../src/config/db');
const { adminToken, staffToken, mockAuthUsers } = require('./helpers');

beforeAll(() => mockAuthUsers());

describe('GET /api/reports/best-selling', () => {
  let query;
  const rows = [
    { productId: 7, name: 'Sugar 1kg', unitsold: '40', revenue: '200000.00', profit: '20000.00' },
    { productId: 3, name: 'Cooking oil', unitsold: '12', revenue: '180000.00', profit: '45000.00' },
  ];

  beforeEach(() => {
    query = jest.spyOn(sequelize, 'query').mockResolvedValue(rows);
  });
  afterEach(() => query.mockRestore());

  it('ranks by units by default, in the shape the screens already use', async () => {
    const res = await request(app).get('/api/reports/best-selling').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual({ productId: 7, unitsold: 40, revenue: 200000, profit: 20000, Product: { id: 7, name: 'Sugar 1kg' } });
    const [sql, options] = query.mock.calls[0];
    expect(sql).toMatch(/ORDER BY "unitsold" DESC/);
    expect(options.replacements).toEqual({ shopId: 10 });
  });

  it('ranks by profit when asked, leaving out items that made no profit', async () => {
    const res = await request(app).get('/api/reports/best-selling?by=profit').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/ORDER BY "profit" DESC/);
    expect(sql).toMatch(/WHERE "profit" > 0/);
  });

  it('takes returns off units and profit', async () => {
    await request(app).get('/api/reports/best-selling').set('Authorization', `Bearer ${adminToken()}`);
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/sale_return_items/);
    expect(sql).toMatch(/s\."units" - COALESCE\(rt\."units", 0\)/);
  });

  it('does not show profit to staff', async () => {
    const res = await request(app).get('/api/reports/best-selling').set('Authorization', `Bearer ${staffToken()}`);

    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual({ productId: 7, unitsold: 40, Product: { id: 7, name: 'Sugar 1kg' } });
  });

  it('refuses the profit ranking to staff', async () => {
    const res = await request(app).get('/api/reports/best-selling?by=profit').set('Authorization', `Bearer ${staffToken()}`);

    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns an empty list if the query fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementationOnce(() => {});
    const res = await request(app).get('/api/reports/best-selling').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
