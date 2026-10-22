// One password rule for every place a password is set (signup, staff
// accounts, resets, profile). Mirrors the check the frontend forms show.
const STRONG_PASSWORD = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
const PASSWORD_RULE_MESSAGE = 'Password must be at least 8 characters and include letters, numbers, and a special character.';

// bcrypt only uses the first 72 bytes; refuse longer input rather than
// silently ignoring the tail.
const MAX_PASSWORD_BYTES = 72;

function passwordProblem(password) {
  const value = String(password || '');
  if (!STRONG_PASSWORD.test(value)) return PASSWORD_RULE_MESSAGE;
  if (Buffer.byteLength(value, 'utf8') > MAX_PASSWORD_BYTES) return 'Password is too long (72 characters at most).';
  return null;
}

module.exports = { passwordProblem, PASSWORD_RULE_MESSAGE };
