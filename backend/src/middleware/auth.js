const { verifyToken, isCurrentSession } = require('../utils/token');
const { User } = require('../models');

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
