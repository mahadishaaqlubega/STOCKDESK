const express = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const importController = require('../controllers/importController');

// Spreadsheet import/export: admin only. Mounted at /api, so the guards sit
// on each route rather than router.use (which would catch every /api path).
const router = express.Router();
const adminOnly = [authenticate, authorize(['Admin'])];

router.post('/import/products', adminOnly, importController.importProducts);
router.post('/import/customers', adminOnly, importController.importCustomers);
router.get('/exports/sales', adminOnly, importController.exportSales);

module.exports = router;
