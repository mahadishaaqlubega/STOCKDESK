require('./setup');
const request = require('supertest');
const app = require('../src/app');
const { Shop, Product } = require('../src/models');
const { adminToken, staffToken, mockAuthUsers } = require('./helpers');
const { DEFAULT_CONFIG, computeStatus, nextPeriod, invalidateShopStatus, toWhatsappNumber } = require('../src/utils/subscription');
const { noticeFor } = require('../src/utils/billingReminders');

const DAY = 86400000;
const now = new Date('2026-11-15T10:00:00Z');
const at = (days) => new Date(now.getTime() + days * DAY);

describe('computeStatus', () => {
  it('is trial while the trial runs', () => {
    const st = computeStatus({ trialEndsAt: at(10) }, DEFAULT_CONFIG, now);
    expect(st.state).toBe('trial');
    expect(st.daysLeft).toBe(10);
    expect(st.readOnly).toBe(false);
  });

  it('is active while paid, even after the trial', () => {
    const st = computeStatus({ trialEndsAt: at(-40), paidUntil: at(5) }, DEFAULT_CONFIG, now);
    expect(st.state).toBe('active');
    expect(st.daysLeft).toBe(5);
  });

  it('is past_due inside the grace period and still writable', () => {
    const st = computeStatus({ trialEndsAt: at(-3) }, DEFAULT_CONFIG, now);
    expect(st.state).toBe('past_due');
    expect(st.readOnly).toBe(false);
    expect(st.graceEndsAt).toEqual(at(4));
  });

  it('is expired and read-only after the grace period', () => {
    const st = computeStatus({ trialEndsAt: at(-40), paidUntil: at(-10) }, DEFAULT_CONFIG, now);
    expect(st.state).toBe('expired');
    expect(st.readOnly).toBe(true);
  });
});

describe('nextPeriod', () => {
  it('starts after the trial when paying early, so no trial days are lost', () => {
    const { start, end } = nextPeriod({ trialEndsAt: at(10) }, 1, now);
    expect(start).toEqual(at(10));
    expect(end.getMonth()).toBe((at(10).getMonth() + 1) % 12);
  });

  it('starts today when the shop has lapsed', () => {
    const { start } = nextPeriod({ trialEndsAt: at(-40), paidUntil: at(-10) }, 3, now);
    expect(start).toEqual(now);
  });
});

describe('toWhatsappNumber', () => {
  it('turns local Ugandan numbers into international ones', () => {
    expect(toWhatsappNumber('0772 123 456')).toBe('256772123456');
    expect(toWhatsappNumber('+256 772 123456')).toBe('256772123456');
    expect(toWhatsappNumber('')).toBe('');
  });
});

describe('billing reminders', () => {
  it('sends the 3-day trial notice once per trial end', () => {
    const shop = { name: 'Kato Store', trialEndsAt: at(2.5) };
    const notice = noticeFor(shop, computeStatus(shop, DEFAULT_CONFIG, now), DEFAULT_CONFIG);
    expect(notice.key).toMatch(/^trial-3:/);
    expect(notice.subject).toMatch(/in 3 days/);
  });

  it('says nothing when the trial has weeks left', () => {
    const shop = { name: 'Kato Store', trialEndsAt: at(20) };
    expect(noticeFor(shop, computeStatus(shop, DEFAULT_CONFIG, now), DEFAULT_CONFIG)).toBeNull();
  });
});

describe('read-only guard for expired shops', () => {
  beforeAll(() => mockAuthUsers());
  afterEach(() => invalidateShopStatus());

  const expiredShop = { id: 10, plan: 'starter', trialEndsAt: new Date(Date.now() - 60 * DAY), paidUntil: null, isActive: true };
  const trialShop = { id: 10, plan: null, trialEndsAt: new Date(Date.now() + 10 * DAY), paidUntil: null, isActive: true };

  it('blocks creating a product when the subscription has expired', async () => {
    Shop.findByPk.mockResolvedValue(expiredShop);
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Rice', category: 'Food', buyPrice: 1, sellPrice: 2 });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('SUBSCRIPTION_EXPIRED');
  });

  it('tells staff to ask the owner', async () => {
    Shop.findByPk.mockResolvedValue(expiredShop);
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({ items: [] });
    expect(res.status).toBe(402);
    expect(res.body.message).toMatch(/owner/i);
  });

  it('still allows reading when expired', async () => {
    Shop.findByPk.mockResolvedValue(expiredShop);
    Product.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).not.toBe(402);
  });

  it('does not block a shop on trial', async () => {
    Shop.findByPk.mockResolvedValue(trialShop);
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).not.toBe(402);
  });
});
