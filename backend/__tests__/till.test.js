require('./setup');
const request = require('supertest');
const app = require('../src/app');
const { adminToken, staffToken, mockAuthUsers } = require('./helpers');
const { TillSession, TillMovement, Sale, CreditPayment, SaleReturn, Expense, SupplierPayment, sequelize } = require('../src/models');
const { cashFromSale } = require('../src/controllers/tillController');

beforeAll(() => mockAuthUsers());

const openSession = (overrides = {}) => ({
  id: 5,
  shopId: 10,
  openedAt: new Date(Date.now() - 60 * 60 * 1000),
  openingFloat: '50000.00',
  update: jest.fn(),
  ...overrides,
});

// Sales during the shift: 30,000 cash, a split with 12,000 cash, a credit
// sale with a 5,000 cash deposit, and a Mobile Money sale (no cash).
function mockShift() {
  Sale.findAll.mockResolvedValue([
    { paymentMethod: 'Cash', total: '30000.00', paymentSplits: null },
    { paymentMethod: 'Split', total: '20000.00', paymentSplits: [{ method: 'Cash', amount: 12000 }, { method: 'Mobile Money', amount: 8000 }] },
    { paymentMethod: 'Credit', total: '40000.00', paymentSplits: [{ method: 'Cash', amount: 5000 }, { method: 'Credit', amount: 35000 }] },
    { paymentMethod: 'Mobile Money', total: '9000.00', paymentSplits: null },
  ]);
  CreditPayment.sum = jest.fn().mockResolvedValue('10000');
  Expense.sum = jest.fn().mockResolvedValue('3000');
  SupplierPayment.sum = jest.fn().mockResolvedValue(null);
  SaleReturn.findAll.mockResolvedValue([{ totalRefund: '4000.00', cashRefund: '2000.00' }]);
  TillMovement.findAll.mockResolvedValue([
    { type: 'in', amount: '1000.00' },
    { type: 'out', amount: '20000.00' },
  ]);
}

// 50,000 + 30,000 + 12,000 + 5,000 + 10,000 + 1,000 - 2,000 - 3,000 - 20,000
const EXPECTED = 83000;

describe('cashFromSale', () => {
  it('counts the whole total of a cash sale', () => {
    expect(cashFromSale({ paymentMethod: 'Cash', total: '1500.50' })).toBe(1500.5);
  });

  it('counts only the cash lines of a split or a credit deposit', () => {
    expect(cashFromSale({ paymentMethod: 'Split', paymentSplits: [{ method: 'Cash', amount: 700 }, { method: 'Card', amount: 300 }] })).toBe(700);
    expect(cashFromSale({ paymentMethod: 'Credit', paymentSplits: JSON.stringify([{ method: 'Cash', amount: 50 }]) })).toBe(50);
  });

  it('counts nothing for Mobile Money, card or broken data', () => {
    expect(cashFromSale({ paymentMethod: 'Mobile Money', total: 900 })).toBe(0);
    expect(cashFromSale({ paymentMethod: 'Split', paymentSplits: 'not json' })).toBe(0);
  });
});

describe('POST /api/till/open', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires sign-in', async () => {
    const res = await request(app).post('/api/till/open').send({ openingFloat: 1000 });
    expect(res.status).toBe(401);
  });

  it.each([-1, 'abc', '', null])('rejects an opening float of %p', async (openingFloat) => {
    const res = await request(app)
      .post('/api/till/open')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({ openingFloat });
    expect(res.status).toBe(400);
    expect(TillSession.create).not.toHaveBeenCalled();
  });

  it('lets staff open the till for their own shop', async () => {
    TillSession.create.mockImplementation(async (values) => ({ id: 7, ...values }));
    const res = await request(app)
      .post('/api/till/open')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({ openingFloat: '50000', shopId: 999 });
    expect(res.status).toBe(201);
    expect(TillSession.create).toHaveBeenCalledWith(expect.objectContaining({ shopId: 10, openedByUserId: 2, openingFloat: 50000 }));
  });

  it('answers 409 when a till is already open', async () => {
    TillSession.create.mockRejectedValue(Object.assign(new Error('dup'), { name: 'SequelizeUniqueConstraintError' }));
    const res = await request(app)
      .post('/api/till/open')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ openingFloat: 0 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already open/);
  });
});

describe('POST /api/till/movements', () => {
  beforeEach(() => jest.clearAllMocks());

  it('needs a reason and a positive amount', async () => {
    TillSession.findOne.mockResolvedValue(openSession());
    const auth = `Bearer ${staffToken()}`;
    expect((await request(app).post('/api/till/movements').set('Authorization', auth).send({ type: 'out', amount: 0, reason: 'x' })).status).toBe(400);
    expect((await request(app).post('/api/till/movements').set('Authorization', auth).send({ type: 'out', amount: 100, reason: ' ' })).status).toBe(400);
    expect((await request(app).post('/api/till/movements').set('Authorization', auth).send({ type: 'sideways', amount: 100, reason: 'x' })).status).toBe(400);
    expect(TillMovement.create).not.toHaveBeenCalled();
  });

  it('refuses when no till is open', async () => {
    TillSession.findOne.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/till/movements')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({ type: 'out', amount: 100, reason: 'Owner took cash' });
    expect(res.status).toBe(409);
  });

  it('records cash taken out against the open till', async () => {
    TillSession.findOne.mockResolvedValue(openSession());
    TillMovement.create.mockImplementation(async (values) => ({ id: 1, ...values }));
    const res = await request(app)
      .post('/api/till/movements')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({ type: 'out', amount: '20000', reason: 'Owner took cash home' });
    expect(res.status).toBe(201);
    expect(TillMovement.create).toHaveBeenCalledWith(expect.objectContaining({ shopId: 10, sessionId: 5, type: 'out', amount: 20000, userId: 2 }));
  });
});

describe('GET /api/till/current', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows admins what the drawer should hold', async () => {
    TillSession.findOne.mockResolvedValueOnce(openSession()).mockResolvedValueOnce(null);
    mockShift();
    const res = await request(app).get('/api/till/current').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.expectedCash).toBe(EXPECTED);
    expect(res.body.breakdown).toMatchObject({ cashSales: 47000, creditPayments: 10000, refunds: 2000, cashOut: 20000 });
  });

  it('keeps the expected total from staff so they count blind', async () => {
    TillSession.findOne.mockResolvedValueOnce(openSession()).mockResolvedValueOnce(null);
    mockShift();
    const res = await request(app).get('/api/till/current').set('Authorization', `Bearer ${staffToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.session).toBeTruthy();
    expect(res.body.expectedCash).toBeUndefined();
    expect(res.body.breakdown).toBeUndefined();
  });

  it('only looks up the signed-in shop', async () => {
    TillSession.findOne.mockResolvedValue(null);
    await request(app).get('/api/till/current').set('Authorization', `Bearer ${staffToken()}`);
    for (const [options] of TillSession.findOne.mock.calls) {
      expect(options.where.shopId).toBe(10);
    }
  });
});

describe('POST /api/till/close', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sequelize.transaction.mockImplementation(() => ({
      commit: jest.fn(),
      rollback: jest.fn(),
      finished: false,
      LOCK: { UPDATE: 'UPDATE' },
    }));
  });

  it('works out the shortage when less cash is counted', async () => {
    const session = openSession();
    TillSession.findOne.mockResolvedValue(session);
    mockShift();
    const res = await request(app)
      .post('/api/till/close')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({ countedCash: 80000 });
    expect(res.status).toBe(200);
    expect(res.body.expectedCash).toBe(EXPECTED);
    expect(res.body.difference).toBe(80000 - EXPECTED);
    expect(session.update).toHaveBeenCalledWith(
      expect.objectContaining({ countedCash: 80000, expectedCash: EXPECTED, difference: -3000, closedByUserId: 2 }),
      expect.anything()
    );
  });

  it('checks that the notes and coins add up', async () => {
    TillSession.findOne.mockResolvedValue(openSession());
    const res = await request(app)
      .post('/api/till/close')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({ countedCash: 60000, denominations: { 50000: 1, 5000: 1 } });
    expect(res.status).toBe(400);
  });

  it('rejects notes that do not exist', async () => {
    const res = await request(app)
      .post('/api/till/close')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({ countedCash: 3000, denominations: { 3000: 1 } });
    expect(res.status).toBe(400);
  });

  it('answers 409 when the till is not open', async () => {
    TillSession.findOne.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/till/close')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({ countedCash: 100 });
    expect(res.status).toBe(409);
  });
});

describe('till history', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is for admins only', async () => {
    const res = await request(app).get('/api/till/sessions').set('Authorization', `Bearer ${staffToken()}`);
    expect(res.status).toBe(403);
  });

  it("answers 404 for another shop's count", async () => {
    TillSession.findOne.mockResolvedValue(null);
    const res = await request(app).get('/api/till/sessions/42').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
    expect(TillSession.findOne.mock.calls[0][0].where).toEqual({ id: '42', shopId: 10 });
  });
});
