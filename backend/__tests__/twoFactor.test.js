require('./setup');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { User } = require('../src/models');
const { signToken } = require('./helpers');
const totp = require('../src/utils/totp');

// RFC 6238 appendix B: the ASCII secret "12345678901234567890" (SHA-1).
const RFC_SECRET = totp.base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP codes', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches the RFC 6238 test vector at %ps', (seconds, code) => {
    expect(totp.hotp(RFC_SECRET, Math.floor(seconds / 30))).toBe(code);
  });

  it('accepts the current code once, and a code from one step ago', () => {
    const now = 1_800_000_000_000;
    const step = totp.currentStep(now);
    expect(totp.verifyTotp(RFC_SECRET, totp.hotp(RFC_SECRET, step), { now })).toBe(step);
    expect(totp.verifyTotp(RFC_SECRET, totp.hotp(RFC_SECRET, step - 1), { now })).toBe(step - 1);
    expect(totp.verifyTotp(RFC_SECRET, totp.hotp(RFC_SECRET, step), { now, lastStep: step })).toBeNull();
    expect(totp.verifyTotp(RFC_SECRET, totp.hotp(RFC_SECRET, step - 3), { now })).toBeNull();
    expect(totp.verifyTotp(RFC_SECRET, 'abcdef', { now })).toBeNull();
  });

  it('encrypts secrets and refuses tampered ones', () => {
    const stored = totp.encryptSecret('JBSWY3DPEHPK3PXP');
    expect(stored).not.toContain('JBSWY3DPEHPK3PXP');
    expect(totp.decryptSecret(stored)).toBe('JBSWY3DPEHPK3PXP');
    const parts = stored.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(totp.decryptSecret(parts.join(':'))).toBeNull();
  });

  it('makes distinct recovery codes and stores only hashes', () => {
    const codes = totp.generateRecoveryCodes();
    expect(new Set(codes).size).toBe(8);
    codes.forEach((c) => expect(c).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/));
    expect(totp.hashRecoveryCode(` ${codes[0].toUpperCase()} `)).toBe(totp.hashRecoveryCode(codes[0]));
  });
});

describe('signing in with two-step sign-in on', () => {
  const secret = totp.generateSecret();
  const recovery = 'abcde-fghjk';
  let owner;

  beforeEach(async () => {
    jest.clearAllMocks();
    owner = {
      id: 99, role: 'SuperAdmin', name: 'Owner', username: 'owner', shopId: null, isVerified: true, tokenVersion: 0,
      password: await bcrypt.hash('Right#Pass1', 4),
      failedLoginCount: 0, lockedUntil: null,
      totpEnabledAt: new Date(), totpSecret: totp.encryptSecret(secret), totpLastStep: null,
      totpRecoveryCodes: [totp.hashRecoveryCode(recovery)],
      update: jest.fn(async function update(values) { Object.assign(this, values); }),
    };
    User.findOne.mockImplementation(async ({ where }) => (where.role === 'SuperAdmin' ? owner : null));
    User.findByPk.mockImplementation(async (id) => (id === 99 ? owner : null));
  });

  const passwordStep = () => request(app).post('/api/auth/login').send({ username: 'owner', password: 'Right#Pass1' });

  it('asks for a code instead of signing in', async () => {
    const res = await passwordStep();
    expect(res.status).toBe(200);
    expect(res.body.twoFactorRequired).toBe(true);
    expect(res.body.token).toBeUndefined();
    expect(res.body.challenge).toBeTruthy();
  });

  it('does not accept the challenge as a session', async () => {
    const { body } = await passwordStep();
    const res = await request(app).get('/api/admin/overview').set('Authorization', `Bearer ${body.challenge}`);
    expect(res.status).toBe(401);
  });

  it('signs in with the current code, and not twice with the same code', async () => {
    const { body } = await passwordStep();
    const code = totp.hotp(secret, totp.currentStep());
    const ok = await request(app).post('/api/auth/login/2fa').send({ challenge: body.challenge, code });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    const again = await request(app).post('/api/auth/login/2fa').send({ challenge: body.challenge, code });
    expect(again.status).toBe(401);
  });

  it('counts a wrong code toward the lockout', async () => {
    const { body } = await passwordStep();
    const res = await request(app).post('/api/auth/login/2fa').send({ challenge: body.challenge, code: '000000' });
    expect(res.status).toBe(401);
    expect(owner.update).toHaveBeenCalledWith(expect.objectContaining({ failedLoginCount: 1 }));
  });

  it('accepts a recovery code once', async () => {
    const { body } = await passwordStep();
    const ok = await request(app).post('/api/auth/login/2fa').send({ challenge: body.challenge, code: recovery });
    expect(ok.status).toBe(200);
    expect(owner.totpRecoveryCodes).toEqual([]);
    const again = await request(app).post('/api/auth/login/2fa').send({ challenge: body.challenge, code: recovery });
    expect(again.status).toBe(401);
  });

  it('rejects a forged or session token as a challenge', async () => {
    const res = await request(app).post('/api/auth/login/2fa').send({ challenge: signToken({ id: 99, role: 'SuperAdmin', p: '2fa' }), code: '123456' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('CHALLENGE_EXPIRED');
  });

  it('never returns the secret with the user record', () => {
    const { User: RealUser } = jest.requireActual('../src/models');
    const user = RealUser.build({ username: 'x', password: 'y', role: 'Admin', totpSecret: 's', totpRecoveryCodes: ['h'] });
    const json = user.toJSON();
    expect(json.totpSecret).toBeUndefined();
    expect(json.totpRecoveryCodes).toBeUndefined();
  });
});

describe('turning two-step sign-in on', () => {
  let admin;
  beforeEach(async () => {
    jest.clearAllMocks();
    admin = {
      id: 1, role: 'Admin', name: 'Admin', username: 'admin', email: 'admin@example.com', shopId: 10, tokenVersion: 0,
      password: await bcrypt.hash('Right#Pass1', 4), totpEnabledAt: null, totpSecret: null,
      update: jest.fn(async function update(values) { Object.assign(this, values); }),
    };
    User.findByPk.mockImplementation(async (id) => (id === 1 ? admin : null));
  });
  const auth = () => `Bearer ${signToken({ id: 1, role: 'Admin', shopId: 10 })}`;

  it('needs the right password (400, not 401, so the user stays signed in) and a code from the new secret', async () => {
    const setup = await request(app).post('/api/profile/2fa/setup').set('Authorization', auth());
    expect(setup.status).toBe(200);
    expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\/StockDesk:admin%40example\.com\?secret=/);
    const code = totp.hotp(setup.body.secret, totp.currentStep());

    const wrongPassword = await request(app).post('/api/profile/2fa/enable').set('Authorization', auth()).send({ password: 'nope', code });
    expect(wrongPassword.status).toBe(400);

    const ok = await request(app).post('/api/profile/2fa/enable').set('Authorization', auth()).send({ password: 'Right#Pass1', code });
    expect(ok.status).toBe(200);
    expect(ok.body.recoveryCodes).toHaveLength(8);
    expect(admin.totpEnabledAt).toBeTruthy();
    expect(totp.decryptSecret(admin.totpSecret)).toBe(setup.body.secret);
  });
});
