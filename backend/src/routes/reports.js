const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const reportController = require('../controllers/reportController');

router.use(authenticate);
// The dashboard and a customer's history are open to all staff.
router.get('/dashboard-stats', reportController.dashboardStats);
router.get('/summary', reportController.summary);
router.get('/best-selling', reportController.bestSelling);
router.get('/customer/:customerId', reportController.customerSales);
// Full sales reports (every sale, revenue per cashier) are for admins, like
// the Reports page itself.
router.get('/daily', authorize(['Admin']), reportController.dailySales);
router.get('/monthly', authorize(['Admin']), reportController.monthlySales);
router.get('/by-cashier', authorize(['Admin']), reportController.salesByCashier);
router.get('/range', authorize(['Admin']), reportController.rangeReport);
router.get('/payments', authorize(['Admin']), reportController.paymentsByMethod);

module.exports = router;
