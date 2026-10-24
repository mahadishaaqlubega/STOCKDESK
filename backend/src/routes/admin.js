const express = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const adminController = require('../controllers/adminController');
const billing = require('../controllers/billingController');
const messages = require('../controllers/messagesController');

const router = express.Router();

router.use(authenticate, authorize(['SuperAdmin']));
router.get('/overview', adminController.getOverview);
router.get('/dashboard', adminController.getDashboard);
router.get('/shops', adminController.getAllShops);
router.get('/shops/:id', adminController.getShopDetail);
router.delete('/shops/:id', adminController.deleteShop);

// Subscriptions and billing
router.get('/billing', billing.adminOverview);
router.put('/billing/config', billing.updateConfig);
router.get('/contacts', billing.listContacts);
router.get('/shops/:id/billing', billing.shopBilling);
router.post('/shops/:id/extend-trial', billing.extendTrial);
router.post('/shops/:id/payments', billing.recordPayment);
router.post('/shops/:id/payment-requests', billing.createRequest);
router.put('/shops/:id/profile', billing.updateShopProfile);
router.put('/shops/:id/active', billing.setShopActive);
router.post('/payments/:paymentId/confirm', billing.confirmPayment);
router.post('/payments/:paymentId/reject', billing.rejectPayment);
router.post('/payment-requests/:requestId/cancel', billing.cancelRequest);
router.get('/payments/:paymentId/receipt.pdf', billing.adminPaymentReceipt);
router.get('/payment-requests/:requestId/invoice.pdf', billing.adminRequestInvoice);
router.get('/shops/:id/invoice.pdf', billing.adminShopInvoice);

// Emails to shop owners
router.get('/messages', messages.overview);
router.post('/messages/preview', messages.preview);
router.post('/messages', messages.send);
router.get('/messages/:id', messages.detail);

module.exports = router;