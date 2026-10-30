const jwt = require('jsonwebtoken');
const { verifyTotp, decryptSecret, hashRecoveryCode } = require('../utils/totp');

// After the password, a user with two-step sign-in on gets this short-lived
// ticket instead of a session. It is signed with a different key from
// session tokens, so it can never be used as one.
const CHALLENGE_MINUTES = 5;
const challengeKey = () => `${process.env.JWT_SECRET}:two-step-challenge`;

function issueChallenge(user) {
  return jwt.sign({ id: user.id, tv: user.tokenVersion || 0, p: '2fa' }, challengeKey(), {
    expiresIn: `${CHALLENGE_MINUTES}m`,
    algorithm: 'HS256',
  });
}

function readChallenge(token) {
  try {
    const payload = jwt.verify(String(token || ''), challengeKey(), { algorithms: ['HS256'] });
    return payload.p === '2fa' ? payload : null;
  } catch {
    return null;
  }
}

const isEnabled = (user) => Boolean(user?.totpEnabledAt && user?.totpSecret);

// Checks a 6-digit code or a recovery code against the user's saved secret.
// On success returns the fields to save (last used step, or the recovery
// codes minus the one used); on failure returns null.
function checkSecondFactor(user, code) {
  const given = String(code || '').trim();
  if (/^\d{3}\s?\d{3}$/.test(given)) {
    const secret = decryptSecret(user.totpSecret);
    if (!secret) return null;
    const step = verifyTotp(secret, given, { lastStep: Number(user.totpLastStep ?? -1) });
    return step == null ? null : { via: 'app', updates: { totpLastStep: step } };
  }
  const hashes = Array.isArray(user.totpRecoveryCodes) ? user.totpRecoveryCodes : [];
  const hash = hashRecoveryCode(given);
  if (!given || !hashes.includes(hash)) return null;
  return { via: 'recovery', updates: { totpRecoveryCodes: hashes.filter((h) => h !== hash) }, remaining: hashes.length - 1 };
}

module.exports = { issueChallenge, readChallenge, isEnabled, checkSecondFactor };
