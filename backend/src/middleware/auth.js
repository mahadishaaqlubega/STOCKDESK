const { verifyToken, isCurrentSession } = require('../utils/token');
const { User } = require('../models');
const { getShopStatus } = require('../utils/subscription');

// Requests a shop can still make when its subscription has expired: reading,
// paying, and managing its own sign-in. Everything else that changes data waits
// until the shop pays.
const READ_ONLY_ALLOWED = [/^\/api\/billing(\/|$)/, /^\/api\/auth(\/|$)/, /^\/api\/profile(\/|$)/];

async function subscriptionBlock(req, user) {
  if (!user.shopId || user.role === 'SuperAdmin') return null;
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return null;
  const path = (req.originalUrl || req.url || '').split('?')[0];
  if (READ_ONLY_ALLOWED.some((re) => re.test(path))) return null;
  const status = await getShopStatus(user.shopId);
  if (!status) return null;
  if (status.disabled) {
    return { status: 403, body: { code: 'SHOP_DISABLED', message: 'This shop has been disabled. Please contact StockDesk support.' } };
  }
  if (status.readOnly) {
    return {
      status: 402,
      body: {
        code: 'SUBSCRIPTION_EXPIRED',
        message: user.role === 'Admin'
          ? 'Your StockDesk subscription has ended, so the shop is read-only. Renew it on the Billing page to keep selling.'
          : "This shop's StockDesk subscription has ended, so changes are paused. Ask the shop owner to renew it.",
      },
    };
  }
  return null;
}

exports.authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyToken(token);
    const user = await User.findByPk(payload.id);
    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    if (!isCurrentSession(payload, user)) {
      return res.status(401).json({ message: 'You were signed out because the password was changed. Please sign in again.' });
    }

    req.user = { id: user.id, role: user.role, name: user.name, username: user.username, shopId: user.shopId };

    let blocked = null;
    try {
      blocked = await subscriptionBlock(req, user);
    } catch (billingError) {
      // Never lock a shop out because the billing check itself failed.
      console.error('[billing] status check failed:', billingError.message);
    }
    if (blocked) return res.status(blocked.status).json(blocked.body);
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token.' });
    }

    return res.status(401).json({ error: 'Authentication failed.' });
  }
};
