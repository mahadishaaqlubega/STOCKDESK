const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const quotationController = require('../controllers/quotationController');

// Everyone at the counter can prepare, send and sell a quote; the activity
// log records who made or cancelled each one.
router.use(authenticate);

router.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(String(id))) {
    return res.status(404).json({ message: 'Quote not found' });
  }
  next();
});

router.get('/', quotationController.list);
router.post('/', quotationController.create);
router.get('/:id', quotationController.get);
router.put('/:id', quotationController.update);
router.post('/:id/cancel', quotationController.cancel);
router.get('/:id/pdf', quotationController.pdf);
router.post('/:id/share', quotationController.share);

module.exports = router;
