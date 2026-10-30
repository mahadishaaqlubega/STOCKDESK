const crypto = require('crypto');

// Two-step sign-in codes (TOTP, RFC 6238): the 6-digit numbers that
// Google Authenticator, Microsoft Authenticator and similar apps show,
// changing every 30 seconds. Written here with Node's crypto instead of a
// package, so there is no extra dependency in the sign-in path.

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error('Invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(code).padStart(DIGITS, '0');
}

const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

// Returns the time step the code belongs to, or null. Accepts one step
// either side for phone clocks that drift, and never a step at or before
// `lastStep`, so a code cannot be used twice.
function verifyTotp(secret, code, { lastStep = -1, now = Date.now(), window = 1 } = {}) {
  const given = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(given)) return null;
  const step = currentStep(now);
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = step + offset;
    if (candidate <= lastStep) continue;
    const expected = hotp(secret, candidate);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return candidate;
  }
  return null;
}

function otpauthUrl({ secret, account, issuer = 'StockDesk' }) {
  // Literal colon between issuer and account: read by every authenticator app.
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// Secrets are stored encrypted (AES-256-GCM). The key comes from
// TWO_FACTOR_KEY, or from JWT_SECRET when that is not set. Recovery codes
// still work if the key ever changes.
function key() {
  const base = process.env.TWO_FACTOR_KEY || `${process.env.JWT_SECRET || ''}:two-step`;
  return crypto.createHash('sha256').update(base).digest();
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

function decryptSecret(stored) {
  const [version, iv, tag, data] = String(stored || '').split(':');
  if (version !== 'v1') return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// One-time recovery codes like "k7m2p-9xq4t". Only their hashes are kept.
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const chars = Array.from(crypto.randomBytes(10), (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

const hashRecoveryCode = (code) => crypto.createHash('sha256').update(String(code).trim().toLowerCase().replace(/\s/g, '')).digest('hex');

module.exports = {
  base32Encode,
  base32Decode,
  generateSecret,
  hotp,
  currentStep,
  verifyTotp,
  otpauthUrl,
  encryptSecret,
  decryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
};
