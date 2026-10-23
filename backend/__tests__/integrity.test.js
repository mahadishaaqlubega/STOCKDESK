require('./setup');
const request = require('supertest');
const app = require('../src/app');
const { adminToken, mockAuthUsers } = require('./helpers');
const { Setting, Product, Sale, SaleItem, SaleReturn, SaleReturnItem, sequelize } = require('../src/models');

beforeAll(() => mockAuthUsers());

function mockTransaction() {
  const tx = { commit: jest.fn(), rollback: jest.fn(), finished: false, LOCK: { UPDATE: 'UPDATE' } };
  tx.rollback.mockImplementation(async () => { tx.finished = 'rollback'; });
  tx.commit.mockImplementation(async () => { tx.finished = 'commit'; });
  sequelize.transaction.mockImplementationOnce(async () => tx);
  // Controllers reach the transaction through Model.sequelize.
  Sale.sequelize = sequelize;
  Product.sequelize = sequelize;
  return tx;
}

describe('PUT /api/settings', () => {
  it('ignores shopId in the body so a shop cannot take over another tenant', async () => {
    const settings = { update: jest.fn().mockResolvedValue(true) };
    Setting.findOne.mockResolvedValueOnce(settings);

    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ shopId: 999, id: 5, currency: 'UGX', vat: 18 });

    expect(res.status).toBe(200);
    expect(settings.update).toHaveBeenCalledWith({ currency: 'UGX', vat: 18 });
  });
});

describe('POST /api/sales', () => {
  it('returns 409 with a readable message when stock is insufficient', async () => {
    const tx = mockTransaction();
    Setting.findOne.mockResolvedValueOnce({ currency: 'UGX', vat: 0, shop: { id: 10 } });
    Product.findOne.mockResolvedValueOnce({ id: 1, name: 'Sugar 1kg', quantity: 1, sellPrice: '5000', save: jest.fn() });

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ items: [{ productId: 1, quantity: 3 }], paymentMethod: 'Cash' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Insufficient stock for Sugar 1kg/);
    expect(tx.rollback).toHaveBeenCalled();
    // The product row must be read with a row lock.
    expect(Product.findOne.mock.calls[0][0]).toMatchObject({ lock: 'UPDATE' });
  });
});

describe('POST /api/sales/:id/return', () => {
  beforeEach(() => {
    SaleReturn.findAll.mockReset();
    SaleReturnItem.findAll.mockReset();
  });

  it('rolls back and rejects returning more than was sold', async () => {
    const tx = mockTransaction();
    Sale.findOne.mockResolvedValueOnce({ id: 7 });
    SaleItem.findAll.mockResolvedValueOnce([{ productId: 1, quantity: 2, price: '5000' }]);
    SaleReturn.findAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .post('/api/sales/7/return')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ items: [{ productId: 1, quantity: 3 }] });

    expect(res.status).toBe(400);
    expect(tx.rollback).toHaveBeenCalled();
  });

  it('counts earlier returns so a sale cannot be refunded twice', async () => {
    const tx = mockTransaction();
    Sale.findOne.mockResolvedValueOnce({ id: 7 });
    SaleItem.findAll.mockResolvedValueOnce([{ productId: 1, quantity: 2, price: '5000' }]);
    SaleReturn.findAll.mockResolvedValueOnce([{ id: 40 }]);
    SaleReturnItem.findAll.mockResolvedValueOnce([{ productId: 1, quantity: 2 }]);

    const res = await request(app)
      .post('/api/sales/7/return')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ items: [{ productId: 1, quantity: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/0 returnable/);
    expect(tx.rollback).toHaveBeenCalled();
  });

  it('releases the transaction when the sale does not exist', async () => {
    const tx = mockTransaction();
    Sale.findOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/sales/404/return')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ items: [{ productId: 1, quantity: 1 }] });

    expect(res.status).toBe(404);
    expect(tx.rollback).toHaveBeenCalled();
  });
});

describe('GET /api/sales/:id', () => {
  it('returns 404 for a non-numeric id instead of a database error', async () => {
    const res = await request(app)
      .get('/api/sales/undefined/receipt')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });
});
