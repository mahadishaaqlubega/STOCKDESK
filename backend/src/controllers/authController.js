const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Shop, User, Setting, PendingSignup, sequelize } = require('../models');
const { Op } = require('sequelize');
const { normalizeUsername } = require('../utils/username');
const { generateUniqueShopSlug } = require('../utils/shop');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');
const auditController = require('./auditController');

function maskEmail(email) {
  const [local, domain] = email.split('@');
  return `${local[0]}***@${domain}`;
}

function signToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required.');
  }

  return jwt.sign(
    { id: user.id, role: user.role, shopId: user.shopId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '8h' }
  );
}

exports.login = async (req, res, next) => {
  try {
    const shopName = req.body.shopName ? String(req.body.shopName).trim() : '';
    const rawIdentifier = req.body.username ? String(req.body.username).trim() : '';
    const password = req.body.password;

    if (!rawIdentifier || !password) {
      return res.status(400).json({ message: 'Shop name, username or email, and password are required' });
    }

    const isEmail = rawIdentifier.includes('@');
    const username = isEmail ? rawIdentifier.toLowerCase() : normalizeUsername(rawIdentifier);

    let shop = null;
    let user = null;

    if (shopName) {
      shop = await Shop.findOne({
        where: {
          name: {
            [Op.iLike]: shopName,
          },
        },
        attributes: ['id', 'name', 'slug'],
      });

      if (!shop) {
        return res.status(401).json({ message: 'Invalid shop name, username, or password' });
      }

      // Try username first, then email
      user = await User.findOne({ where: { shopId: shop.id, username } });
      if (!user && isEmail) {
        user = await User.findOne({ where: { shopId: shop.id, email: username } });
      } else if (!user && !isEmail) {
        user = await User.findOne({
          where: { shopId: shop.id, email: { [Op.iLike]: rawIdentifier } },
        });
      }
    }

    if (!user) {
      // Platform owner lookup — by username or email, regardless of shopId.
      // SuperAdmin accounts must never be scoped to a tenant shop.
      user = await User.findOne({ where: { username, role: 'SuperAdmin' } });
      if (!user && isEmail) {
        user = await User.findOne({ where: { email: username, role: 'SuperAdmin' } });
      }
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid shop name, username, or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid shop name, username, or password' });
    }

    if (!user.isVerified) {
      // Legacy accounts created before email verification was introduced: allow
      // sign-in so the admin can add/verify their email from the Profile page.
      // New accounts never exist unverified (they are created only after the
      // verification link is clicked), so no new shop can sign in this way.
      await auditController.logAction(user.id, user.shopId, 'LOGIN', 'USER', user.id, {}, req);
      return res.status(200).json({
        token: signToken(user),
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          role: user.role,
          shopId: user.shopId,
          shop: null,
          isVerified: false,
        },
      });
    }

    if (!shop && user.shopId) {
      shop = await Shop.findByPk(user.shopId, { attributes: ['id', 'name', 'slug'] });
    }

    const token = signToken(user);

    await auditController.logAction(user.id, user.shopId, 'LOGIN', 'USER', user.id, {}, req);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        shopId: user.shopId,
        shop,
        isVerified: true,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    next(error);
  }
};

exports.signup = async (req, res, next) => {
  try {
    const {
      shopName,
      email: rawEmail,
      username,
      password,
      confirmPassword,
    } = req.body;

    const normalizedShopName = shopName ? String(shopName).trim() : '';
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = rawEmail ? String(rawEmail).trim().toLowerCase() : '';

    if (!normalizedShopName || !normalizedEmail || !normalizedUsername || !password || !confirmPassword) {
      return res.status(400).json({ message: 'Shop name, email, username, password, and confirm password are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const existingShop = await Shop.findOne({
      where: {
        name: {
          [Op.iLike]: normalizedShopName,
        },
      },
    });

    if (existingShop) {
      return res.status(409).json({ message: 'Shop name is already in use' });
    }

    const pendingShop = await PendingSignup.findOne({ where: { shopName: { [Op.iLike]: normalizedShopName } } });
    if (pendingShop && pendingShop.email.toLowerCase() !== normalizedEmail) {
      return res.status(409).json({ message: 'Shop name is already being registered by another account' });
    }

    const existingEmail = await User.findOne({ where: { email: { [Op.iLike]: normalizedEmail } } });
    if (existingEmail) {
      // Check whether the user's shop still exists — if the shop was deleted but the
      // user row wasn't cleaned up (orphaned record), free the email and continue.
      const ownerShop = existingEmail.shopId
        ? await Shop.findByPk(existingEmail.shopId)
        : null;

      if (ownerShop || existingEmail.shopId === null) {
        // Active user (shop exists) or a SuperAdmin — genuinely taken
        return res.status(409).json({ message: 'An account with this email already exists' });
      }

      // Orphaned user: shop was deleted but row remained — clear the email so the
      // unique constraint doesn't block the INSERT below, then delete the row.
      await existingEmail.update({ email: null });
      await existingEmail.destroy();
    }

    const hash = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Re-signing up while a verification is already pending for this email:
    // refresh the pending record with the latest details and resend the link.
    const pendingExisting = await PendingSignup.findOne({ where: { email: { [Op.iLike]: normalizedEmail } } });
    if (pendingExisting) {
      pendingExisting.shopName = normalizedShopName;
      pendingExisting.username = normalizedUsername;
      pendingExisting.passwordHash = hash;
      pendingExisting.verificationToken = verificationToken;
      await pendingExisting.save();

      try {
        await sendVerificationEmail(normalizedEmail, verificationToken, {
          name: normalizedUsername,
          shopName: normalizedShopName,
        });
      } catch (emailError) {
        console.error('Failed to resend verification email:', emailError.message);
        return res.status(502).json({
          message: 'Unable to send the verification email right now. Please try again later.',
        });
      }

      return res.status(201).json({
        message: 'A new verification link has been sent to your email. Your shop will be created once you verify.',
        email: normalizedEmail,
        shopName: normalizedShopName,
      });
    }

    await PendingSignup.create({
      shopName: normalizedShopName,
      username: normalizedUsername,
      email: normalizedEmail,
      passwordHash: hash,
      verificationToken,
    });

    try {
      await sendVerificationEmail(normalizedEmail, verificationToken, {
        name: normalizedUsername,
        shopName: normalizedShopName,
      });
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError.message);
      await PendingSignup.destroy({ where: { email: normalizedEmail } });

      return res.status(502).json({
        message: 'Registration failed because the verification email could not be sent. Please try again.',
      });
    }

    res.status(201).json({
      message: 'Registration received. Please check your email to verify your account — your shop will be created once your email is verified.',
      email: normalizedEmail,
      shopName: normalizedShopName,
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: 'Verification token is required' });
    }

    const pending = await PendingSignup.findOne({ where: { verificationToken: token } });

    if (pending) {
      const transaction = await sequelize.transaction();
      try {
        const shopNameTaken = await Shop.findOne({
          where: { name: { [Op.iLike]: pending.shopName } },
          transaction,
        });
        if (shopNameTaken) {
          await transaction.rollback();
          await pending.destroy();
          return res.status(409).json({
            message: 'That shop name was already taken before your email was verified. Please sign up again with a different shop name.',
          });
        }

        const emailTaken = await User.findOne({ where: { email: { [Op.iLike]: pending.email } }, transaction });
        if (emailTaken) {
          await transaction.rollback();
          await pending.destroy();
          return res.status(409).json({
            message: 'That email is already registered to another account. Please sign in or use a different email.',
          });
        }

        const shop = await Shop.create(
          {
            name: pending.shopName,
            slug: await generateUniqueShopSlug(Shop, pending.shopName),
          },
          { transaction }
        );

        await Setting.create(
          {
            shopName: shop.name,
            address: '',
            phone: '',
            currency: 'USD',
            shopId: shop.id,
          },
          { transaction }
        );

        await User.create(
          {
            name: pending.username,
            username: pending.username,
            email: pending.email,
            password: pending.passwordHash,
            role: 'Admin',
            shopId: shop.id,
            isVerified: true,
            verificationToken: null,
          },
          { transaction }
        );

        await pending.destroy({ transaction });
        await transaction.commit();

        return res.json({
          message: 'Email verified successfully. Your shop has been created and you can now sign in.',
        });
      } catch (error) {
        if (!transaction.finished) {
          await transaction.rollback();
        }
        throw error;
      }
    }

    // Legacy flow: some accounts predate pending signups and hold unverified users.
    const user = await User.findOne({ where: { verificationToken: token } });
    if (!user) {
      return res.status(400).json({ message: 'This verification link is invalid or has already been used.' });
    }

    await user.update({ isVerified: true, verificationToken: null });

    res.json({ message: 'Email verified successfully. You can now sign in.' });
  } catch (error) {
    next(error);
  }
};

exports.resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email address is required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Pending (not yet created) registrations
    const pending = await PendingSignup.findOne({ where: { email: { [Op.iLike]: normalizedEmail } } });
    if (pending) {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      await pending.update({ verificationToken });
      try {
        await sendVerificationEmail(normalizedEmail, verificationToken, {
          name: pending.username,
          shopName: pending.shopName,
        });
      } catch (emailError) {
        console.error('Failed to resend verification email:', emailError.message);
        return res.status(502).json({
          message: 'Unable to send the verification email right now. Please try again later.',
        });
      }
      return res.json({ message: 'A new verification link has been sent to your email address.' });
    }

    // Legacy flow: accounts created before pending signups were introduced
    const user = await User.findOne({ where: { email: { [Op.iLike]: normalizedEmail } } });

    // Always respond with success to avoid email enumeration
    if (!user || user.isVerified) {
      return res.json({ message: 'If that email has a pending verification, a new link has been sent.' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await user.update({ verificationToken });
    try {
      await sendVerificationEmail(normalizedEmail, verificationToken);
    } catch (emailError) {
      console.error('Failed to resend verification email:', emailError.message);
      return res.status(502).json({
        message: 'Unable to send the verification email right now. Please try again later.',
      });
    }

    res.json({ message: 'A new verification link has been sent to your email address.' });
  } catch (error) {
    next(error);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email address is required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ where: { email: { [Op.iLike]: normalizedEmail } } });

    // Always respond with success to avoid email enumeration
    if (user) {
      const resetPasswordToken = crypto.randomBytes(32).toString('hex');
      const resetPasswordExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.update({ resetPasswordToken, resetPasswordExpiry });
      try {
        await sendPasswordResetEmail(normalizedEmail, resetPasswordToken);
      } catch (emailError) {
        console.error('Failed to send password reset email:', emailError.message);
      }
    }

    res.json({ message: "If that email is registered, a reset link has been sent to your inbox." });
  } catch (error) {
    next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password, confirmPassword } = req.body;
    if (!token || !password || !confirmPassword) {
      return res.status(400).json({ message: 'Token, password, and confirm password are required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const user = await User.findOne({ where: { resetPasswordToken: token } });
    if (!user) {
      return res.status(400).json({ message: 'This password reset link is invalid or has already been used.' });
    }
    if (!user.resetPasswordExpiry || new Date() > new Date(user.resetPasswordExpiry)) {
      return res.status(400).json({ message: 'This password reset link has expired. Please request a new one.' });
    }

    const hash = await bcrypt.hash(password, 10);
    await user.update({
      password: hash,
      resetPasswordToken: null,
      resetPasswordExpiry: null,
      isVerified: true,
    });

    res.json({ message: 'Password reset successfully. You can now sign in.' });
  } catch (error) {
    next(error);
  }
};

exports.refreshToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const payload = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    const user = await User.findByPk(payload.id, {
      include: [{ model: Shop, as: 'shop', attributes: ['id', 'name', 'slug'], required: false }],
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid session' });
    }

    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        shopId: user.shopId,
        shop: user.shop || null,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid session' });
    }
    next(error);
  }
};
