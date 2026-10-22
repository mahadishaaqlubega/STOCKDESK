require('./setup');
const request = require('supertest');
const app = require('../src/app');
const { adminToken, staffToken } = require('./helpers');
const { Product, Customer, Expense, Sale } = require('../src/models');
const { mockAuthUsers } = require('./helpers');

beforeAll(() => mockAuthUsers());

describe('GET /api/products', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires authentication', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(401);
  });

  it('returns product list for authenticated admin', async () => {
    Product.findAll.mockResolvedValue([
      { id: 1, name: 'Widget', price: 9.99, buyPrice: 5.00, stock: 100, shopId: 10 },
    ]);

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/products', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires Admin role', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({ name: 'Test', price: 10, buyPrice: 5, stock: 10 });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/customers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires authentication', async () => {
    const res = await request(app).get('/api/customers');
    expect(res.status).toBe(401);
  });

  it('returns customer list for authenticated user', async () => {
    Customer.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
  });
});

describe('GET /api/expenses', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires authentication', async () => {
    const res = await request(app).get('/api/expenses');
    expect(res.status).toBe(401);
  });

  it('returns expenses for authenticated user', async () => {
    Expense.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/expenses')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
  });
});

describe('GET /api/settings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires authentication', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/sales', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires authentication', async () => {
    const res = await request(app).get('/api/sales');
    expect(res.status).toBe(401);
  });

  it('returns sales for authenticated user', async () => {
    Sale.findAll = jest.fn().mockResolvedValue([]);

    const res = await request(app)
      .get('/api/sales')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/refresh', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('returns new token for valid session', async () => {
    const { User, Shop } = require('../src/models');
    User.findByPk.mockResolvedValue({
      id: 1, name: 'Admin', username: 'admin', email: 'admin@test.com',
      role: 'Admin', shopId: 10, isVerified: true, shop: { id: 10, name: 'TestShop', slug: 'testshop' },
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });
});
