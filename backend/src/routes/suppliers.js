const express = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const supplierController = require('../controllers/supplierController');

// Buying stock and paying suppliers is admin work, like restocking.
const router = express.Router();
router.use(authenticate, authorize(['Admin']));

router.param('id', (req, res, next, id) => (/^\d+$/.test(String(id)) ? next() : res.status(404).json({ message: 'Supplier not found' })));

router.get('/', supplierController.listSuppliers);
router.post('/', supplierController.createSupplier);
router.put('/:id', supplierController.updateSupplier);
router.delete('/:id', supplierController.deleteSupplier);
router.get('/:id/statement', supplierController.supplierStatement);
router.post('/:id/payments', supplierController.paySupplier);

module.exports = router;
