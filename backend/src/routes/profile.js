const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const profileController = require('../controllers/profileController');

router.use(authenticate, authorize(['Admin', 'SuperAdmin']));
router.get('/', profileController.getProfile);
router.put('/', profileController.updateProfile);
router.post('/change-password', profileController.changePassword);
router.post('/close-account', profileController.closeAccount);
router.post('/sign-out-everywhere', profileController.signOutEverywhere);
router.post('/2fa/setup', profileController.twoFactorSetup);
router.post('/2fa/enable', profileController.twoFactorEnable);
router.post('/2fa/disable', profileController.twoFactorDisable);
router.post('/2fa/recovery-codes', profileController.twoFactorRecoveryCodes);

module.exports = router;
