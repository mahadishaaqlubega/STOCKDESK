require('./setup');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { signToken } = require('./helpers');
const { User, Shop } = require('../src/models');
const { passwordProblem } = require('../src/utils/password');
const { escapeLike } = require('../src/utils/sql');

describe('password rule', () => {
  it.each(['1', 'password', 'password1', 'Pass!word', '12345678!'])('rejects weak password %p', (pw) => {
    expect(passwordProblem(pw)).toMatch(/at least 8/);
  });

  it('accepts a password with a letter, number and symbol', () => {
    expect(passwordProblem('shop2026!')).toBeNull();
  });

  it('rejects passwords bcrypt would silently truncate', () => {
    expect(passwordProblem(`a1!${'x'.repeat(80)}`)).toMatch(/too long/);
  });
});

describe('escapeLike', () => {
  it('makes LIKE wildcards literal', () => {
    expect(escapeLike('%')).toBe('\\%');
    expect(escapeLike('a_b\\c')).toBe('a\\_b\\\\c');
    expect(escapeLike('Plain Shop')).toBe('Plain Shop');
  });
});

describe('session versioning', () => {
  afterEach(() => User.findByPk.mockReset());

  it('accepts tokens issued before versioning (no tv) while tokenVersion is 0', async () => {
    User.findByPk.mockResolvedValue({ id: 1, role: 'Admin', name: 'A', username: 'a', shopId: 10, tokenVersion: 0 });
    const res = await request(app).get('/api/profile').set('Authorization', `Bearer ${signToken({ id: 1, role: 'Admin', shopId: 10 })}`);
    expect(res.status).not.toBe(401);
  });

  it('rejects a token from before a password change', async () => {
    User.findByPk.mockResolvedValue({ id: 1, role: 'Admin', name: 'A', username: 'a', shopId: 10, tokenVersion: 2 });
    const res = await request(app).get('/api/products').set('Authorization', `Bearer ${signToken({ id: 1, role: 'Admin', shopId: 10, tv: 1 })}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/password was changed/);
  });
});

describe('login lockout', () => {
  beforeEach(() => jest.clearAllMocks());

  function mockUser(fields) {
    const user = {
      id: 1, name: 'Admin', username: 'admin', role: 'Admin', shopId: 10, isVerified: true,
      failedLoginCount: 0, lockedUntil: null, tokenVersion: 0,
      ...fields,
    };
    user.update = jest.fn(async (changes) => Object.assign(user, changes));
    Shop.findOne.mockResolvedValue({ id: 10, name: 'TestShop', slug: 'testshop' });
    User.findOne.mockResolvedValueOnce(user).mockResolvedValue(null);
    return user;
  }

  it('locks the account on the 10th wrong password', async () => {
    const user = mockUser({ password: await bcrypt.hash('right-pass1!', 4), failedLoginCount: 9 });
    const res = await request(app).post('/api/auth/login').send({ shopName: 'TestShop', username: 'admin', password: 'wrong' });
    expect(res.status).toBe(429);
    expect(user.lockedUntil).toBeInstanceOf(Date);
    expect(user.failedLoginCount).toBe(0);
  });

  it('refuses even the right password while locked', async () => {
    mockUser({ password: await bcrypt.hash('right-pass1!', 4), lockedUntil: new Date(Date.now() + 5 * 60000) });
    const res = await request(app).post('/api/auth/login').send({ shopName: 'TestShop', username: 'admin', password: 'right-pass1!' });
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/locked/);
  });

  it('clears the failure count after a successful login', async () => {
    const user = mockUser({ password: await bcrypt.hash('right-pass1!', 4), failedLoginCount: 4 });
    const res = await request(app).post('/api/auth/login').send({ shopName: 'TestShop', username: 'admin', password: 'right-pass1!' });
    expect(res.status).toBe(200);
    expect(user.failedLoginCount).toBe(0);
  });

  it('escapes wildcards in the shop name lookup', async () => {
    Shop.findOne.mockResolvedValue(null);
    User.findOne.mockResolvedValue(null);
    await request(app).post('/api/auth/login').send({ shopName: '%', username: 'admin', password: 'x' });
    const where = Shop.findOne.mock.calls[0][0].where.name;
    expect(where[require('sequelize').Op.iLike]).toBe('\\%');
  });
});
