require('./setup');
const request = require('supertest');
const app = require('../src/app');
const { adminToken, staffToken, mockAuthUsers } = require('./helpers');
const { Sale, CreditPayment, SaleReturn, Product } = require('../src/models');
const { tendersFromSplits } = require('../src/utils/paymentBreakdown');

beforeAll(() => mockAuthUsers());

describe('tendersFromSplits', () => {
  it('adds up split lines and a credit deposit, leaving out the credit part', () => {
    expect(tendersFromSplits([{ method: 'Cash', amount: 700 }, { method: 'Card', amount: 300 }])).toEqual({ Cash: 700, 'Mobile Money': 0, Card: 300 });
    expect(tendersFromSplits(JSON.stringify([{ method: 'Mobile Money', amount: 5000 }, { method: 'Credit', amount: 15000 }]))).toEqual({ Cash: 0, 'Mobile Money': 5000, Card: 0 });
  });

  it('counts nothing for broken data', () => {
    expect(tendersFromSplits('not json')).toEqual({ Cash: 0, 'Mobile Money': 0, Card: 0 });
    expect(tendersFromSplits(null)).toEqual({ Cash: 0, 'Mobile Money': 0, Card: 0 });
  });
});

describe('GET /api/reports/payments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Sale.sum = jest.fn();
    SaleReturn.sum = jest.fn();
  });

  // One day: 30,000 cash and 9,000 Mobile Money sales, a split of 12,000 cash
  // and 8,000 card, a credit sale with a 5,000 Mobile Money deposit (35,000
  // on credit), and 10,000 paid on debts by Mobile Money.
  function mockDay() {
    Sale.findAll
      .mockResolvedValueOnce([
        { paymentMethod: 'Cash', amount: '30000.00' },
        { paymentMethod: 'Mobile Money', amount: '9000.00' },
      ])
      .mockResolvedValueOnce([
        { paymentSplits: [{ method: 'Cash', amount: 12000 }, { method: 'Card', amount: 8000 }] },
        { paymentSplits: [{ method: 'Mobile Money', amount: 5000 }, { method: 'Credit', amount: 35000 }] },
      ]);
    CreditPayment.findAll.mockResolvedValueOnce([{ method: 'Mobile Money', amount: '10000.00' }]);
    Sale.sum.mockResolvedValueOnce('35000.00');
    SaleReturn.sum.mockResolvedValueOnce('2000.00');
  }

  it('is for admins only', async () => {
    const res = await request(app).get('/api/reports/payments?start=2026-11-01').set('Authorization', `Bearer ${staffToken()}`);
    expect(res.status).toBe(403);
  });

  it('rejects a bad date', async () => {
    const res = await request(app).get('/api/reports/payments?start=yesterday').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it('splits the day by Cash, Mobile Money and Card', async () => {
    mockDay();
    const res = await request(app).get('/api/reports/payments?start=2026-11-01').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.start).toBe('2026-11-01');
    expect(res.body.end).toBe('2026-11-01');
    expect(res.body.methods).toEqual([
      { method: 'Cash', sales: 42000, debtPayments: 0, total: 42000 },
      { method: 'Mobile Money', sales: 14000, debtPayments: 10000, total: 24000 },
      { method: 'Card', sales: 8000, debtPayments: 0, total: 8000 },
    ]);
    expect(res.body.total).toBe(74000);
    expect(res.body.soldOnCredit).toBe(35000);
    expect(res.body.cashRefunds).toBe(2000);
  });

  it('only reads this shop for the whole local day', async () => {
    mockDay();
    await request(app).get('/api/reports/payments?start=2026-11-01').set('Authorization', `Bearer ${adminToken()}`);

    const where = Sale.findAll.mock.calls[0][0].where;
    expect(where.shopId).toBe(10);
    const [from, to] = Object.getOwnPropertySymbols(where.createdAt).map((key) => where.createdAt[key]);
    expect(from.getHours()).toBe(0);
    expect(from.getDate()).toBe(1);
    expect(to.getDate()).toBe(1);
    expect(to.getHours()).toBe(23);
    expect(CreditPayment.findAll.mock.calls[0][0].where.shopId).toBe(10);
  });
});

describe('product expiry dates', () => {
  beforeEach(() => jest.clearAllMocks());

  const post = (body) => request(app).post('/api/products').set('Authorization', `Bearer ${adminToken()}`)
    .send({ name: 'Panadol', category: 'Medicine', buyPrice: 500, sellPrice: 1000, quantity: 10, lowStock: 2, ...body });

  it('is optional', async () => {
    Product.create.mockResolvedValueOnce({ id: 1 });
    const res = await post({});
    expect(res.status).toBe(201);
    expect(Product.create.mock.calls[0][0]).not.toHaveProperty('expiryDate');
  });

  it('saves a valid date', async () => {
    Product.create.mockResolvedValueOnce({ id: 1 });
    const res = await post({ expiryDate: '2027-03-31' });
    expect(res.status).toBe(201);
    expect(Product.create.mock.calls[0][0].expiryDate).toBe('2027-03-31');
  });

  it('rejects a date that does not exist', async () => {
    const res = await post({ expiryDate: '2027-02-30' });
    expect(res.status).toBe(400);
    expect(Product.create).not.toHaveBeenCalled();
  });

  it('never gives a service an expiry date', async () => {
    Product.create.mockResolvedValueOnce({ id: 1 });
    await post({ type: 'service', expiryDate: '2027-03-31' });
    expect(Product.create.mock.calls[0][0].expiryDate).toBeNull();
  });

  it('clears the date when it is emptied', async () => {
    const product = { id: 1, type: 'goods', sellPrice: '1000', update: jest.fn() };
    Product.findOne.mockResolvedValueOnce(product);
    const res = await request(app).put('/api/products/1').set('Authorization', `Bearer ${adminToken()}`).send({ expiryDate: '' });
    expect(res.status).toBe(200);
    expect(product.update.mock.calls[0][0].expiryDate).toBeNull();
  });
});
