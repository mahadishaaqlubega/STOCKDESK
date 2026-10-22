require('./setup');
const request = require('supertest');
const app = require('../src/app');
const { adminToken, staffToken, superAdminToken } = require('./helpers');
const { User, Shop, PendingSignup } = require('../src/models');

describe('GET /api', () => {
  it('returns health check response', async () => {
    const res = await request(app).get('/api');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'OK');
    expect(res.body).toHaveProperty('message');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when username is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'test123' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin' });
    expect(res.status).toBe(400);
  });

  it('returns 401 when user does not exist', async () => {
    Shop.findOne.mockResolvedValue(null);
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ shopName: 'TestShop', username: 'nonexistent', password: 'pass' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it('returns 200 with token for valid shop admin login', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('password123', 10);

    Shop.findOne.mockResolvedValue({ id: 10, name: 'TestShop', slug: 'testshop' });
    User.findOne
      .mockResolvedValueOnce({
        id: 1, name: 'Admin', username: 'admin', email: 'admin@test.com',
        password: hash, role: 'Admin', shopId: 10, isVerified: true,
      })
      .mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ shopName: 'TestShop', username: 'admin', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('role', 'Admin');
    expect(res.body.user).toHaveProperty('isVerified', true);
  });

  it('returns 200 with token for valid SuperAdmin login (no shopName)', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('adminpass', 10);

    // With no shop name, the first lookup is the platform-owner lookup.
    User.findOne.mockReset();
    User.findOne
      .mockResolvedValueOnce({
        id: 99, name: 'Owner', username: 'owner', email: 'owner@test.com',
        password: hash, role: 'SuperAdmin', shopId: null, isVerified: true,
      })
      .mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ shopName: '', username: 'owner', password: 'adminpass' });

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('role', 'SuperAdmin');
    expect(res.body.user.shopId).toBeNull();
  });

  it('returns 401 for wrong password', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('correctpass', 10);

    Shop.findOne.mockResolvedValue({ id: 10, name: 'TestShop', slug: 'testshop' });
    User.findOne.mockResolvedValue({
      id: 1, name: 'Admin', username: 'admin', email: 'admin@test.com',
      password: hash, role: 'Admin', shopId: 10, isVerified: true,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ shopName: 'TestShop', username: 'admin', password: 'wrongpass' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/signup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ shopName: 'NewShop' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        shopName: 'NewShop', email: 'notanemail', username: 'user1',
        password: 'Pass123!', confirmPassword: 'Pass123!',
      });
    expect(res.status).toBe(400);
  });

  it('returns 400 when passwords do not match', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        shopName: 'NewShop', email: 'user@test.com', username: 'user1',
        password: 'Pass123!', confirmPassword: 'DifferentPass!',
      });
    expect(res.status).toBe(400);
  });

  it('returns 201 for valid signup', async () => {
    Shop.findOne.mockResolvedValue(null);
    PendingSignup.findOne.mockResolvedValue(null);
    User.findOne.mockResolvedValue(null);
    PendingSignup.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        shopName: 'NewShop', email: 'user@test.com', username: 'user1',
        password: 'Pass123!', confirmPassword: 'Pass123!',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('message');
  });
});

describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 even for non-existent email (no enumeration)', async () => {
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset link/i);
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when token is missing', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ password: 'NewPass1!', confirmPassword: 'NewPass1!' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when passwords do not match', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'abc', password: 'NewPass1!', confirmPassword: 'Other!' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid/expired token', async () => {
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'invalid-token', password: 'NewPass1!', confirmPassword: 'NewPass1!' });
    expect(res.status).toBe(400);
  });
});
