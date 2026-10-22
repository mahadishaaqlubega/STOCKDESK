const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const reportController = require('../controllers/reportController');

router.use(authenticate);
router.get('/dashboard-stats', reportController.dashboardStats);
router.get('/summary', reportController.summary);
router.get('/daily', reportController.dailySales);
router.get('/monthly', reportController.monthlySales);
router.get('/best-selling', reportController.bestSelling);
router.get('/by-cashier', reportController.salesByCashier);
router.get('/range', reportController.rangeReport);
router.get('/customer/:customerId', reportController.customerSales);

module.exports = router;
