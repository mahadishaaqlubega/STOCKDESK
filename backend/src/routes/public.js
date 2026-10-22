const express = require('express');
const rateLimit = require('express-rate-limit');
const saleController = require('../controllers/saleController');

// Unauthenticated endpoints: links customers open from WhatsApp.
const router = express.Router();

router.use(rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again in a minute.' },
}));

router.get('/receipts/:token', saleController.publicReceipt);

module.exports = router;
