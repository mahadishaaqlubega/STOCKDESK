const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Shop, User, Setting, PendingSignup, sequelize } = require('../models');
const { Op } = require('sequelize');
const { escapeLike } = require('../utils/sql');
const { signToken, verifyToken, isCurrentSession } = require('../utils/token');
const { passwordProblem } = require('../utils/password');
const { normalizeUsername } = require('../utils/username');
const { generateUniqueShopSlug } = require('../utils/shop');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');
const auditController = require('./auditController');
const twoFactor = require('../services/twoFactor');

function maskEmail(email) {
  const [local, domain] = email.split('@');
  return `${local[0]}***@${domain}`;
}

const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MINUTES = 15;

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
            [Op.iLike]: escapeLike(shopName),
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
          where: { shopId: shop.id, email: { [Op.iLike]: escapeLike(rawIdentifier) } },
        });
      }
    }

    if (!user) {
      // Platform owner lookup - by username or email, regardless of shopId.
      // SuperAdmin accounts must never be scoped to a tenant shop.
      user = await User.findOne({ where: { username, role: 'SuperAdmin' } });
      if (!user && isEmail) {
        user = await User.findOne({ where: { email: username, role: 'SuperAdmin' } });
      }
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid shop name, username, or password' });
    }

    // Per-account lockout: the IP rate limit alone does not stop guessing
    // spread across many networks.
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const minutes = Math.ceil((new Date(user.lockedUntil) - Date.now()) / 60000);
      return res.status(429).json({
        message: `Too many wrong passwords. This account is locked for ${minutes} more minute${minutes === 1 ? '' : 's'}, or reset the password by email.`,
      });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      const failures = (user.failedLoginCount || 0) + 1;
      const locking = failures >= MAX_FAILED_LOGINS;
      await user.update({
        failedLoginCount: locking ? 0 : failures,
        lockedUntil: locking ? new Date(Date.now() + LOCKOUT_MINUTES * 60000) : user.lockedUntil,
      });
      if (locking) {
        await auditController.logAction(user.id, user.shopId, 'LOCKED', 'USER', user.id, { failures }, req);
        return res.status(429).json({
          message: `Too many wrong passwords. This account is locked for ${LOCKOUT_MINUTES} minutes, or reset the password by email.`,
        });
      }
      return res.status(401).json({ message: 'Invalid shop name, username, or password' });
    }

    if (user.failedLoginCount || user.lockedUntil) {
      await user.update({ failedLoginCount: 0, lockedUntil: null });
    }

    // Two-step sign-in: the password was right, now ask for the code.
    if (twoFactor.isEnabled(user)) {
      return res.json({ twoFactorRequired: true, challenge: twoFactor.issueChallenge(user) });
    }

    await sendSession(req, res, user, shop);
  } catch (error) {
    console.error('Login error:', error);
    next(error);
  }
};

// The signed-in response, after the password (and the code, if two-step
// sign-in is on).
async function sendSession(req, res, user, shop = null, details = {}) {
  await auditController.logAction(user.id, user.shopId, 'LOGIN', 'USER', user.id, details, req);
  if (!user.isVerified) {
    // Legacy accounts created before email verification was introduced: allow
    // sign-in so the admin can add/verify their email from the Profile page.
    // New accounts never exist unverified (they are created only after the
    // verification link is clicked), so no new shop can sign in this way.
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

  res.json({
    token: signToken(user),
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
}

// POST /api/auth/login/2fa { challenge, code } - the second step. Wrong codes
// count toward the same lockout as wrong passwords.
exports.loginTwoFactor = async (req, res, next) => {
  try {
    const payload = twoFactor.readChallenge(req.body.challenge);
    if (!payload) {
      return res.status(401).json({ message: 'This sign-in has expired. Enter your password again.', code: 'CHALLENGE_EXPIRED' });
    }
    const user = await User.findByPk(payload.id);
    if (!user || !isCurrentSession(payload, user) || !twoFactor.isEnabled(user)) {
      return res.status(401).json({ message: 'This sign-in has expired. Enter your password again.', code: 'CHALLENGE_EXPIRED' });
    }
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const minutes = Math.ceil((new Date(user.lockedUntil) - Date.now()) / 60000);
      return res.status(429).json({ message: `Too many wrong codes. This account is locked for ${minutes} more minute${minutes === 1 ? '' : 's'}.` });
    }

    const result = twoFactor.checkSecondFactor(user, req.body.code);
    if (!result) {
      const failures = (user.failedLoginCount || 0) + 1;
      const locking = failures >= MAX_FAILED_LOGINS;
      await user.update({
        failedLoginCount: locking ? 0 : failures,
        lockedUntil: locking ? new Date(Date.now() + LOCKOUT_MINUTES * 60000) : user.lockedUntil,
      });
      if (locking) {
        await auditController.logAction(user.id, user.shopId, 'LOCKED', 'USER', user.id, { failures, step: 'two-step code' }, req);
        return res.status(429).json({ message: `Too many wrong codes. This account is locked for ${LOCKOUT_MINUTES} minutes.` });
      }
      return res.status(401).json({ message: 'That code is not right. Check the newest code in your authenticator app.' });
    }

    await user.update({ ...result.updates, failedLoginCount: 0, lockedUntil: null });
    await sendSession(req, res, user, null, { twoStep: result.via, ...(result.via === 'recovery' ? { recoveryCodesLeft: result.remaining } : {}) });
  } catch (error) {
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
      phone: rawPhone,
      businessType: rawBusinessType,
      location: rawLocation,
    } = req.body;

    const normalizedShopName = shopName ? String(shopName).trim() : '';
    const phone = rawPhone ? String(rawPhone).trim().slice(0, 32) : '';
    const businessType = rawBusinessType ? String(rawBusinessType).trim().slice(0, 60) : null;
    const location = rawLocation ? String(rawLocation).trim().slice(0, 120) : null;
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = rawEmail ? String(rawEmail).trim().toLowerCase() : '';

    if (!normalizedShopName || !normalizedEmail || !normalizedUsername || !password || !confirmPassword) {
      return res.status(400).json({ message: 'Shop name, email, username, password, and confirm password are required' });
    }

    if (phone.replace(/[^\d]/g, '').length < 9) {
      return res.status(400).json({ message: 'Please enter a phone number we can reach you on (WhatsApp if you have it)' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }
    const signupPasswordProblem = passwordProblem(password);
    if (signupPasswordProblem) {
      return res.status(400).json({ message: signupPasswordProblem });
    }

    const existingShop = await Shop.findOne({
      where: {
        name: {
          [Op.iLike]: escapeLike(normalizedShopName),
        },
      },
    });

    if (existingShop) {
      return res.status(409).json({ message: 'Shop name is already in use' });
    }

    const pendingShop = await PendingSignup.findOne({ where: { shopName: { [Op.iLike]: escapeLike(normalizedShopName) } } });
    if (pendingShop && pendingShop.email.toLowerCase() !== normalizedEmail) {
      return res.status(409).json({ message: 'Shop name is already being registered by another account' });
    }

    const existingEmail = await User.findOne({ where: { email: { [Op.iLike]: escapeLike(normalizedEmail) } } });
    if (existingEmail) {
      // Check whether the user's shop still exists - if the shop was deleted but the
      // user row wasn't cleaned up (orphaned record), free the email and continue.
      const ownerShop = existingEmail.shopId
        ? await Shop.findByPk(existingEmail.shopId)
        : null;

      if (ownerShop || existingEmail.shopId === null) {
        // Active user (shop exists) or a SuperAdmin - genuinely taken
        return res.status(409).json({ message: 'An account with this email already exists' });
      }

      // Orphaned user: shop was deleted but row remained - clear the email so the
      // unique constraint doesn't block the INSERT below, then delete the row.
      await existingEmail.update({ email: null });
      await existingEmail.destroy();
    }

    const hash = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Re-signing up while a verification is already pending for this email:
    // refresh the pending record with the latest details and resend the link.
    const pendingExisting = await PendingSignup.findOne({ where: { email: { [Op.iLike]: escapeLike(normalizedEmail) } } });
    if (pendingExisting) {
      pendingExisting.shopName = normalizedShopName;
      pendingExisting.username = normalizedUsername;
      pendingExisting.passwordHash = hash;
      pendingExisting.verificationToken = verificationToken;
      pendingExisting.phone = phone;
      pendingExisting.businessType = businessType;
      pendingExisting.location = location;
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
      phone,
      businessType,
      location,
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
      message: 'Registration received. Please check your email to verify your account. Your shop will be created once your email is verified.',
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
          where: { name: { [Op.iLike]: escapeLike(pending.shopName) } },
          transaction,
        });
        if (shopNameTaken) {
          await transaction.rollback();
          await pending.destroy();
          return res.status(409).json({
            message: 'That shop name was already taken before your email was verified. Please sign up again with a different shop name.',
          });
        }

        const emailTaken = await User.findOne({ where: { email: { [Op.iLike]: escapeLike(pending.email) } }, transaction });
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
            ownerPhone: pending.phone || null,
            businessType: pending.businessType || null,
            location: pending.location || null,
          },
          { transaction }
        );

        await Setting.create(
          {
            shopName: shop.name,
            address: '',
            phone: pending.phone || '',
            currency: 'UGX',
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
    const pending = await PendingSignup.findOne({ where: { email: { [Op.iLike]: escapeLike(normalizedEmail) } } });
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
    const user = await User.findOne({ where: { email: { [Op.iLike]: escapeLike(normalizedEmail) } } });

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
    const user = await User.findOne({ where: { email: { [Op.iLike]: escapeLike(normalizedEmail) } } });

    // Always respond with success to avoid email enumeration
    if (user) {
      // Only a hash is stored, so a leaked database or backup cannot be
      // used to reset anyone's password. The email carries the token itself.
      const resetPasswordToken = crypto.randomBytes(32).toString('hex');
      const resetPasswordExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.update({ resetPasswordToken: hashResetToken(resetPasswordToken), resetPasswordExpiry });
      try {
        await sendPasswordResetEmail(normalizedEmail, resetPasswordToken, { name: user.name || user.username });
      } catch (emailError) {
        console.error('Failed to send password reset email:', emailError.message);
      }
    }

    res.json({ message: "If that email is registered, a reset link has been sent to your inbox." });
  } catch (error) {
    next(error);
  }
};

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password, confirmPassword } = req.body;
    if (!token || !password || !confirmPassword) {
      return res.status(400).json({ message: 'Token, password, and confirm password are required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }
    const resetPasswordProblem = passwordProblem(password);
    if (resetPasswordProblem) {
      return res.status(400).json({ message: resetPasswordProblem });
    }

    const user = await User.findOne({ where: { resetPasswordToken: hashResetToken(token) } });
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
      // A reset usually means the password may be known to someone else:
      // end every existing session and lift any lockout.
      tokenVersion: (user.tokenVersion || 0) + 1,
      failedLoginCount: 0,
      lockedUntil: null,
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

    const payload = verifyToken(authHeader.split(' ')[1]);
    const user = await User.findByPk(payload.id, {
      include: [{ model: Shop, as: 'shop', attributes: ['id', 'name', 'slug'], required: false }],
    });

    if (!user || !isCurrentSession(payload, user)) {
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
