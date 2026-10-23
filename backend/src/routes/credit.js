const express = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const creditController = require('../controllers/creditController');

const router = express.Router();

router.use(authenticate, authorize(['Admin', 'Staff']));
router.get('/summary', creditController.summary);

module.exports = router;
