const express = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const billing = require('../controllers/billingController');

const router = express.Router();

router.use(authenticate);
router.get('/status', billing.getStatus);
router.get('/payments', authorize(['Admin']), billing.listPayments);
router.post('/payments', authorize(['Admin']), billing.submitPayment);
router.put('/profile', authorize(['Admin']), billing.updateProfile);

module.exports = router;
