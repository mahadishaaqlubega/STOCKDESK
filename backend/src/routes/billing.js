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
router.get('/payments/:id/receipt.pdf', authorize(['Admin']), billing.myPaymentReceipt);
router.get('/requests/:id/invoice.pdf', authorize(['Admin']), billing.myRequestInvoice);
router.get('/invoice.pdf', authorize(['Admin']), billing.myPlanInvoice);

module.exports = router;
