const express = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const supplierController = require('../controllers/supplierController');

const router = express.Router();
router.use(authenticate, authorize(['Admin']));

router.param('id', (req, res, next, id) => (/^\d+$/.test(String(id)) ? next() : res.status(404).json({ message: 'Purchase not found' })));

router.get('/', supplierController.listPurchases);
router.post('/', supplierController.createPurchase);
router.get('/:id', supplierController.getPurchase);

module.exports = router;
