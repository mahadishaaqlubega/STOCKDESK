require('./setup');
const request = require('supertest');
const app = require('../src/app');
const { adminToken, staffToken, mockAuthUsers } = require('./helpers');
const { clientIp, isCloudflare } = require('../src/utils/clientIp');
const { isPublicAddress, isPublicHost, fetchRemoteImage } = require('../src/utils/remoteImage');

beforeAll(() => mockAuthUsers());

const fakeReq = (ip, headers = {}) => ({ ip, get: (name) => headers[name.toLowerCase()] });

describe('clientIp', () => {
  it('uses the connecting address when the request did not come through Cloudflare', () => {
    expect(clientIp(fakeReq('41.210.10.5', { 'cf-connecting-ip': '1.2.3.4' }))).toBe('41.210.10.5');
  });

  it("believes Cloudflare's visitor header only from Cloudflare addresses", () => {
    expect(isCloudflare('172.67.180.225')).toBe(true);
    expect(clientIp(fakeReq('172.67.180.225', { 'cf-connecting-ip': '41.210.10.5' }))).toBe('41.210.10.5');
    expect(clientIp(fakeReq('::ffff:104.21.75.191', { 'cf-connecting-ip': '41.210.10.5' }))).toBe('41.210.10.5');
  });

  it('ignores a malformed visitor header', () => {
    expect(clientIp(fakeReq('172.67.180.225', { 'cf-connecting-ip': 'not-an-ip' }))).toBe('172.67.180.225');
  });
});

describe('logo downloads', () => {
  it.each(['127.0.0.1', '10.1.2.3', '192.168.1.10', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '0.0.0.0'])(
    'treats %s as private',
    (ip) => expect(isPublicAddress(ip)).toBe(false)
  );

  it('allows public addresses', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('2606:4700::1111')).toBe(true);
  });

  it('unwraps IPv4 written as IPv6', () => {
    expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true);
  });

  it('refuses internal host names without a lookup', async () => {
    expect(await isPublicHost('postgres.railway.internal')).toBe(false);
    expect(await isPublicHost('localhost')).toBe(false);
  });

  it.each([
    'http://example.com/logo.png',
    'https://127.0.0.1/logo.png',
    'https://user:pass@example.com/logo.png',
    'file:///etc/passwd',
    'not a url',
  ])('never fetches %s', async (url) => {
    const spy = jest.spyOn(global, 'fetch');
    expect(await fetchRemoteImage(url)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('report access', () => {
  it.each(['/api/reports/daily', '/api/reports/monthly', '/api/reports/by-cashier', '/api/reports/range?start=2026-01-01&end=2026-01-31'])(
    'keeps %s from staff',
    async (path) => {
      const res = await request(app).get(path).set('Authorization', `Bearer ${staffToken()}`);
      expect(res.status).toBe(403);
    }
  );

  it('still lets admins in', async () => {
    const res = await request(app).get('/api/reports/by-cashier').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).not.toBe(403);
  });
});

describe('response headers', () => {
  it('does not advertise the server framework', async () => {
    const res = await request(app).get('/api');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-frame-options']).toBe('DENY');
  });
});

describe('password reset', () => {
  const { User } = require('../src/models');
  afterEach(() => User.findOne.mockReset());

  it('looks up the reset link by its hash, never the raw token', async () => {
    User.findOne.mockResolvedValue(null);
    const token = 'a'.repeat(64);
    await request(app).post('/api/auth/reset-password').send({ token, password: 'shop2026!x', confirmPassword: 'shop2026!x' });
    const where = User.findOne.mock.calls[0][0].where;
    expect(where.resetPasswordToken).toMatch(/^[0-9a-f]{64}$/);
    expect(where.resetPasswordToken).not.toBe(token);
  });
});
