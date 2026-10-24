const bcrypt = require('bcryptjs');
const { staffUsage } = require('../utils/subscription');
const { passwordProblem } = require('../utils/password');
const { User, Shop } = require('../models');
const { normalizeUsername } = require('../utils/username');

function normalizeManageableRole(role) {
  return role === 'Admin' ? 'Admin' : 'Staff';
}

exports.listUsers = async (req, res, next) => {
  try {
    const users = await User.findAll({
      where: { shopId: req.user.shopId },
      attributes: ['id', 'name', 'username', 'email', 'role', 'displayRole', 'isVerified', 'createdAt', 'shopId'],
      order: [['createdAt', 'ASC']],
    });
    res.json(users);
  } catch (error) {
    next(error);
  }
};

exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findOne({
      where: { id: req.params.id, shopId: req.user.shopId },
      attributes: ['id', 'name', 'username', 'role', 'displayRole', 'createdAt', 'shopId'],
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    next(error);
  }
};

exports.createUser = async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body.username);
    const password = req.body.password ? String(req.body.password) : '';
    const confirmPassword = req.body.confirmPassword ? String(req.body.confirmPassword) : '';
    const role = req.body.role ? normalizeManageableRole(req.body.role) : 'Staff';
    const displayRole = req.body.displayRole || role;

    if (!username || !password || !confirmPassword) {
      return res.status(400).json({ message: 'Username, password, and confirm password are required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }
    const newUserPasswordProblem = passwordProblem(password);
    if (newUserPasswordProblem) {
      return res.status(400).json({ message: newUserPasswordProblem });
    }

    const existingUser = await User.findOne({ where: { shopId: req.user.shopId, username } });
    if (existingUser) {
      return res.status(409).json({ message: 'Username is already in use for this shop' });
    }

    // Staff logins are limited by the shop's plan (unlimited on the free trial).
    const shopRow = await Shop.findByPk(req.user.shopId);
    if (shopRow) {
      const usage = await staffUsage(shopRow);
      if (!usage.canAdd) {
        return res.status(403).json({
          code: 'STAFF_LIMIT',
          message: usage.source === 'custom'
            ? `Your shop can have ${usage.limit} staff login${usage.limit === 1 ? '' : 's'}. Contact StockDesk to add more.`
            : `Your ${usage.planName || 'current'} plan includes ${usage.limit} staff login${usage.limit === 1 ? '' : 's'} and you are using ${usage.used}. Upgrade your plan on the Billing page to add more.`,
          usage,
        });
      }
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: username,
      username,
      email: null,
      password: hash,
      role,
      displayRole,
      shopId: req.user.shopId,
      isVerified: true,
      verificationToken: null,
    });
    // Return plaintext password to admin only (visible in response)
    res.status(201).json({
      id: user.id,
      name: user.name,
      username: user.username,
      plainPassword: password,
      role: user.role,
      displayRole: user.displayRole,
      shopId: user.shopId,
    });
  } catch (error) {
    next(error);
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    const user = await User.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { username, role } = req.body;
    if (username !== undefined) {
      const normalizedUsername = normalizeUsername(username);
      if (!normalizedUsername) {
        return res.status(400).json({ message: 'Username is required' });
      }
      const existingUser = await User.findOne({
        where: {
          shopId: req.user.shopId,
          username: normalizedUsername,
        },
      });
      if (existingUser && existingUser.id !== user.id) {
        return res.status(409).json({ message: 'Username is already in use for this shop' });
      }
      user.username = normalizedUsername;
      user.name = normalizedUsername;
    }
    if (role) {
      user.role = normalizeManageableRole(role);
      user.displayRole = req.body.displayRole || role;
    }
    await user.save();

    res.json({ id: user.id, name: user.name, username: user.username, role: user.role, displayRole: user.displayRole, shopId: user.shopId });
  } catch (error) {
    next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const user = await User.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const password = req.body.password ? String(req.body.password) : '';
    const confirmPassword = req.body.confirmPassword ? String(req.body.confirmPassword) : '';

    if (!password || !confirmPassword) {
      return res.status(400).json({ message: 'Password and confirm password are required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }
    const resetPasswordProblem = passwordProblem(password);
    if (resetPasswordProblem) {
      return res.status(400).json({ message: resetPasswordProblem });
    }

    user.password = await bcrypt.hash(password, 10);
    // Sign the staff member out everywhere so the old password's sessions end.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.failedLoginCount = 0;
    user.lockedUntil = null;
    await user.save();

    res.json({
      message: 'Password reset successfully.',
      id: user.id,
      username: user.username,
      plainPassword: password,
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    const destroyed = await User.destroy({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!destroyed) return res.status(404).json({ message: 'User not found' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

