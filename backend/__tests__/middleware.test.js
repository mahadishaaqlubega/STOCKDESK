require('./setup');
const request = require('supertest');
const app = require('../src/app');
const { adminToken, staffToken, superAdminToken, mockAuthUsers } = require('./helpers');

beforeAll(() => mockAuthUsers());

describe('Authentication middleware', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid token', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });

  it('returns 401 for expired token', async () => {
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('./helpers');
    const expired = jwt.sign({ id: 1, role: 'Admin', shopId: 10 }, JWT_SECRET, { expiresIn: '0s' });

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});

describe('Role-based access control', () => {
  it('returns 403 when Staff tries to access Admin-only route', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${staffToken()}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 when Admin tries to access SuperAdmin-only route', async () => {
    const res = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(403);
  });

  it('allows Admin to access Admin-only routes', async () => {
    const { User } = require('../src/models');
    User.findByPk.mockResolvedValue({
      id: 1, role: 'Admin', name: 'Admin', username: 'admin', shopId: 10,
    });
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).not.toBe(403);
  });

  it('allows SuperAdmin to access SuperAdmin-only routes', async () => {
    const { User } = require('../src/models');
    User.findByPk.mockResolvedValue({
      id: 99, role: 'SuperAdmin', name: 'Owner', username: 'owner', shopId: null,
    });

    const res = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${superAdminToken()}`);
    expect(res.status).not.toBe(403);
  });
});
