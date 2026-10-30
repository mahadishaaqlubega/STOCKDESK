require('./setup');
const request = require('supertest');
const app = require('../src/app');
const { adminToken, staffToken, mockAuthUsers } = require('./helpers');
const { Quotation, Product, Customer, Setting, Shop, sequelize } = require('../src/models');
const { quoteNumber } = require('../src/utils/quotePdf');

beforeAll(() => mockAuthUsers());

const future = '2099-01-31';

function mockShop({ vat = 0 } = {}) {
  Setting.findOne.mockResolvedValue({ vat, currency: 'UGX' });
  Product.findAll.mockResolvedValue([
    { id: 7, name: 'Cement 50kg', sellPrice: '40000.00' },
    { id: 8, name: 'Nails 1kg', sellPrice: '8000.00' },
  ]);
  Shop.findByPk.mockResolvedValue({ id: 10 });
  Quotation.max = jest.fn().mockResolvedValue(41);
  Quotation.create.mockImplementation(async (values) => ({ id: 99, ...values, toJSON() { return { id: 99, ...values }; } }));
  sequelize.transaction.mockImplementation(() => ({ commit: jest.fn(), rollback: jest.fn(), finished: false, LOCK: { UPDATE: 'UPDATE' } }));
}

describe('quote numbers', () => {
  it('prefixes quotations and proformas differently', () => {
    expect(quoteNumber({ docType: 'quotation', number: 12 })).toBe('QT-00012');
    expect(quoteNumber({ docType: 'proforma', number: 7 })).toBe('PF-00007');
  });
});

describe('POST /api/quotations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShop();
  });

  it('requires sign-in', async () => {
    expect((await request(app).post('/api/quotations').send({})).status).toBe(401);
  });

  it('prices lines from the catalogue, adds VAT and numbers the quote', async () => {
    mockShop({ vat: 18 });
    const res = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({
        docType: 'proforma',
        billToName: 'St. Mary\'s School',
        items: [{ productId: 7, quantity: 10 }, { name: 'Delivery to Mukono', quantity: 1, price: 50000 }],
        discount: 10000,
        validUntil: future,
        shopId: 999,
      });
    expect(res.status).toBe(201);
    const created = Quotation.create.mock.calls[0][0];
    expect(created).toMatchObject({ shopId: 10, number: 42, docType: 'proforma', billToName: "St. Mary's School", subtotal: 450000, discount: 10000, taxRate: 18, taxAmount: 79200, total: 519200, createdByUserId: 2 });
    expect(created.items).toEqual([
      { productId: 7, name: 'Cement 50kg', quantity: 10, price: 40000, lineTotal: 400000 },
      { productId: null, name: 'Delivery to Mukono', quantity: 1, price: 50000, lineTotal: 50000 },
    ]);
    expect(res.body.displayNumber).toBe('PF-00042');
  });

  it("only looks up products of the signed-in shop", async () => {
    await request(app).post('/api/quotations').set('Authorization', `Bearer ${adminToken()}`)
      .send({ billToName: 'A', items: [{ productId: 7, quantity: 1 }], validUntil: future });
    expect(Product.findAll.mock.calls[0][0].where.shopId).toBe(10);
  });

  it.each([
    [{ billToName: 'A', items: [] }, /at least one item/],
    [{ billToName: 'A', items: [{ productId: 555, quantity: 1 }] }, /product not found/],
    [{ billToName: 'A', items: [{ name: 'X', quantity: 0, price: 1 }] }, /quantity/],
    [{ billToName: 'A', items: [{ name: 'X', quantity: 1, price: -5 }] }, /price/],
    [{ billToName: 'A', items: [{ quantity: 1, price: 5 }] }, /describe the item/],
    [{ billToName: '  ', items: [{ name: 'X', quantity: 1, price: 5 }] }, /who the quote is for/],
    [{ billToName: 'A', docType: 'receipt', items: [{ name: 'X', quantity: 1, price: 5 }] }, /quotation or proforma/],
    [{ billToName: 'A', discount: 99, items: [{ name: 'X', quantity: 1, price: 5 }] }, /Discount/],
    [{ billToName: 'A', validUntil: '2000-01-01', items: [{ name: 'X', quantity: 1, price: 5 }] }, /past/],
  ])('rejects %p', async (body, message) => {
    const res = await request(app).post('/api/quotations').set('Authorization', `Bearer ${staffToken()}`).send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
    expect(Quotation.create).not.toHaveBeenCalled();
  });

  it('fills the customer details from a customer on file', async () => {
    Customer.findOne.mockResolvedValue({ id: 3, name: 'Ben Builders', phone: '0772000000', email: null, address: 'Wakiso' });
    await request(app).post('/api/quotations').set('Authorization', `Bearer ${staffToken()}`)
      .send({ customerId: 3, items: [{ productId: 8, quantity: 2 }], validUntil: future });
    expect(Customer.findOne.mock.calls[0][0].where).toEqual({ id: 3, shopId: 10 });
    expect(Quotation.create.mock.calls[0][0]).toMatchObject({ customerId: 3, billToName: 'Ben Builders', billToPhone: '0772000000', billToAddress: 'Wakiso' });
  });
});

describe('changing and cancelling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShop();
  });

  it('will not edit a quote that was already sold', async () => {
    Quotation.findOne.mockResolvedValue({ status: 'converted', toJSON: () => ({}) });
    const res = await request(app).put('/api/quotations/5').set('Authorization', `Bearer ${staffToken()}`).send({ discount: 0 });
    expect(res.status).toBe(409);
  });

  it('cancels an open quote', async () => {
    const quote = { id: 5, status: 'open', docType: 'quotation', number: 3, update: jest.fn(async function (v) { Object.assign(this, v); }), toJSON() { return { ...this }; } };
    Quotation.findOne.mockResolvedValue(quote);
    const res = await request(app).post('/api/quotations/5/cancel').set('Authorization', `Bearer ${staffToken()}`);
    expect(res.status).toBe(200);
    expect(quote.update).toHaveBeenCalledWith({ status: 'cancelled' });
  });

  it("answers 404 for another shop's quote", async () => {
    Quotation.findOne.mockResolvedValue(null);
    const res = await request(app).get('/api/quotations/5').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
    expect(Quotation.findOne.mock.calls[0][0].where).toEqual({ id: '5', shopId: 10 });
  });
});

describe('public quote links', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects malformed tokens without a lookup', async () => {
    const res = await request(app).get('/api/public/quotations/abc');
    expect(res.status).toBe(404);
    expect(Quotation.findOne).not.toHaveBeenCalled();
  });

  it('hides cancelled quotes', async () => {
    Quotation.findOne.mockResolvedValue({ status: 'cancelled' });
    const res = await request(app).get('/api/public/quotations/AAAAAAAAAAAAAAAAAAAAAAAA');
    expect(res.status).toBe(404);
  });
});
