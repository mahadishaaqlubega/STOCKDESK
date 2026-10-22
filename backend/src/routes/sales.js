const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const saleController = require('../controllers/saleController');
const userController = require('../controllers/userController');

router.use(authenticate);

// Reject non-numeric sale ids up front instead of letting Postgres raise a
// type error (which surfaced as a 500).
router.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(String(id))) {
    return res.status(404).json({ message: 'Sale not found' });
  }
  next();
});

router.get('/day-closures', authorize(['Admin']), saleController.listDayClosures);
router.post('/close-day', authorize(['Admin']), saleController.closeBusinessDay);
router.get('/returns', authorize(['Admin']), saleController.listReturns);

router.post('/', saleController.createSale);
router.get('/', saleController.listSales);
router.get('/:id', saleController.getSale);
router.get('/:id/receipt', saleController.getSaleReceipt);
router.post('/:id/return', authorize(['Admin']), saleController.createReturn);

module.exports = router;
