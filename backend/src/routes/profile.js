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

module.exports = router;
