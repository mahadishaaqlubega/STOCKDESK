const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const {
  User,
  Shop,
  Setting,
  Product,
  Sale,
  Customer,
  PendingSignup,
  SaleItem,
  SaleReturn,
  SaleReturnItem,
  Receipt,
  DayClosure,
  Expense,
  StockIn,
  StockReconciliation,
  Audit,
  sequelize,
} = require('../models');
const { Op } = require('sequelize');
const { sendVerificationEmail } = require('../services/emailService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATA_URL_REGEX = /^data:image\/(png|jpeg|webp|gif);base64,/;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB decoded

function toProfile(user, shop, extra = {}) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    shopId: user.shopId,
    shop: shop
      ? { id: shop.id, name: shop.name, slug: shop.slug }
      : null,
    avatarUrl: user.avatarUrl,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
    ...extra,
  };
}

exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let shop = null;
    let shopDetails = null;
    let stats = null;

    if (user.shopId) {
      shop = await Shop.findByPk(user.shopId, { attributes: ['id', 'name', 'slug'] });
      const setting = await Setting.findOne({ where: { shopId: user.shopId } });
      shopDetails = setting
        ? {
            shopName: setting.shopName,
            address: setting.address || '',
            phone: setting.phone || '',
            currency: setting.currency || 'USD',
          }
        : null;

      const [products, sales, customers] = await Promise.all([
        Product.count({ where: { shopId: user.shopId } }),
        Sale.count({ where: { shopId: user.shopId } }),
        Customer.count({ where: { shopId: user.shopId } }),
      ]);
      stats = { products, sales, customers };
    }

    res.json(
      toProfile(user, shop, {
        shopDetails,
        stats,
        emailVerified: user.isVerified,
      })
    );
  } catch (error) {
    next(error);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'Current password, new password, and confirm password are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const strongPassword = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
    if (!strongPassword.test(newPassword)) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters and include letters, numbers, and a special character.',
      });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { name, email, avatarUrl } = req.body;
    const updates = {};

    if (name !== undefined) {
      const normalizedName = String(name).trim();
      if (!normalizedName) {
        return res.status(400).json({ message: 'Name is required' });
      }
      updates.name = normalizedName;
    }

    if (email !== undefined) {
      if (email === null || String(email).trim() === '') {
        updates.email = null;
        updates.isVerified = false;
        updates.verificationToken = null;
      } else {
        const normalizedEmail = String(email).trim().toLowerCase();
        if (!EMAIL_REGEX.test(normalizedEmail)) {
          return res.status(400).json({ message: 'Please enter a valid email address' });
        }

        const existing = await User.findOne({
          where: { email: { [Op.iLike]: normalizedEmail }, id: { [Op.ne]: user.id } },
        });
        if (existing) {
          return res.status(409).json({ message: 'An account with this email already exists' });
        }

        const pendingEmail = await PendingSignup.findOne({ where: { email: { [Op.iLike]: normalizedEmail } } });
        if (pendingEmail) {
          return res.status(409).json({ message: 'That email is pending verification on another signup. Please try a different email.' });
        }

        // Only (re)verify when the address actually changes.
        const currentEmail = user.email ? String(user.email).toLowerCase() : '';
        if (normalizedEmail !== currentEmail) {
          updates.email = normalizedEmail;
          updates.isVerified = false;
          updates.verificationToken = crypto.randomBytes(32).toString('hex');
        }
      }
    }

    if (avatarUrl !== undefined) {
      if (avatarUrl === null || avatarUrl === '') {
        updates.avatarUrl = null;
      } else {
        if (typeof avatarUrl !== 'string' || !DATA_URL_REGEX.test(avatarUrl)) {
          return res.status(400).json({ message: 'Avatar must be a PNG, JPEG, WebP, or GIF image' });
        }
        const base64 = avatarUrl.split(',')[1] || '';
        try {
          const decoded = Buffer.from(base64, 'base64');
          if (decoded.length > MAX_AVATAR_BYTES) {
            return res.status(400).json({ message: 'Avatar image is too large. Please use an image under 2 MB.' });
          }
        } catch (err) {
          return res.status(400).json({ message: 'Avatar image data is invalid' });
        }
        updates.avatarUrl = avatarUrl;
      }
    }

    if (Object.keys(updates).length > 0) {
      await user.update(updates);
    }

    const shop = user.shopId
      ? await Shop.findByPk(user.shopId, { attributes: ['id', 'name', 'slug'] })
      : null;

    let verificationEmailSent = false;
    let verificationWarning = null;
    if (updates.email !== undefined && updates.email !== null && updates.verificationToken) {
      try {
        await sendVerificationEmail(updates.email, updates.verificationToken, {
          name: user.name,
          shopName: shop?.name,
        });
        verificationEmailSent = true;
      } catch (emailError) {
        console.error('Failed to send profile verification email:', emailError.message);
        verificationWarning =
          'Your email was saved, but the verification link could not be sent right now. You can resend it from the Profile page.';
      }
    }

    const profile = toProfile(user, shop, {
      emailVerified: user.isVerified,
      verificationPending: Boolean(updates.verificationToken),
      verificationEmailSent,
    });
    if (verificationWarning) {
      profile.message = verificationWarning;
    }

    res.json(profile);
  } catch (error) {
    next(error);
  }
};

// Delete the caller's own account after verifying their password and a
// confirmation flag. If the account is the last user of a shop, the shop and
// its data are removed as well so no orphaned tenant remains.
exports.closeAccount = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const user = await User.findByPk(req.user.id, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Account not found' });
    }

    const { currentPassword, confirm } = req.body;
    if (!currentPassword || confirm !== true) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Password and confirmation are required to close the account.' });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Only the last remaining user of a shop triggers shop cleanup. Other
    // staff/team accounts are left intact.
    let deleteShop = false;
    if (user.shopId) {
      const remainingUsers = await User.count({ where: { shopId: user.shopId, id: { [require('sequelize').Op.ne]: user.id } }, transaction });
      deleteShop = remainingUsers === 0;
    }

    if (deleteShop) {
      const shopId = user.shopId;
      await SaleReturnItem.destroy({ where: { shopId }, transaction });
      await SaleReturn.destroy({ where: { shopId }, transaction });
      await Receipt.destroy({ where: { shopId }, transaction });
      await SaleItem.destroy({ where: { shopId }, transaction });
      await Sale.destroy({ where: { shopId }, transaction });
      await DayClosure.destroy({ where: { shopId }, transaction });
      await StockReconciliation.destroy({ where: { shopId }, transaction });
      await StockIn.destroy({ where: { shopId }, transaction });
      await Audit.destroy({ where: { shopId }, transaction });
      await Expense.destroy({ where: { shopId }, transaction });
      await Product.destroy({ where: { shopId }, transaction });
      await Customer.destroy({ where: { shopId }, transaction });
      await Setting.destroy({ where: { shopId }, transaction });
      await Shop.destroy({ where: { id: shopId }, transaction });
    }

    await user.destroy({ transaction });
    await transaction.commit();

    res.json({ message: 'Your account has been closed.' });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    next(error);
  }
};
