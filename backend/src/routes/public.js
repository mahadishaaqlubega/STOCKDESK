const express = require('express');
const rateLimit = require('express-rate-limit');
const { clientIp } = require('../utils/clientIp');
const saleController = require('../controllers/saleController');
const quotationController = require('../controllers/quotationController');

// Unauthenticated endpoints: links customers open from WhatsApp.
const router = express.Router();

router.use(rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again in a minute.' },
  keyGenerator: clientIp,
}));

router.get('/receipts/:token', saleController.publicReceipt);
router.get('/quotations/:token', quotationController.publicPdf);

module.exports = router;
