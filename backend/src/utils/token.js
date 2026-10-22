const jwt = require('jsonwebtoken');

// `tv` (token version) ties a session to the user's current tokenVersion.
// Bumping the column — on a password change or reset, or "sign out
// everywhere" — makes every session issued before it invalid.
function signToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required.');
  }

  return jwt.sign(
    { id: user.id, role: user.role, shopId: user.shopId, tv: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '8h', algorithm: 'HS256' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
}

// Tokens issued before versioning carry no `tv`; they count as version 0 so
// nobody is signed out by the upgrade itself.
function isCurrentSession(payload, user) {
  return (payload.tv || 0) === (user.tokenVersion || 0);
}

module.exports = { signToken, verifyToken, isCurrentSession };
