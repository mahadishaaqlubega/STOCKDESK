const express = require('express');
const router = express.Router();
const { login, loginTwoFactor, signup, verifyEmail, resendVerification, forgotPassword, resetPassword, refreshToken } = require('../controllers/authController');

router.post('/login', login);
router.post('/login/2fa', loginTwoFactor);
router.post('/signup', signup);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/refresh', refreshToken);

module.exports = router;
