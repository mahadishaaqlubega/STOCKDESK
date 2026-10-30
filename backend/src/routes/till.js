const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const tillController = require('../controllers/tillController');

router.use(authenticate);

router.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(String(id))) {
    return res.status(404).json({ message: 'Till count not found' });
  }
  next();
});

// Anyone on the till can open it, record cash in or out, and count it.
router.get('/current', tillController.current);
router.post('/open', tillController.open);
router.post('/movements', tillController.addMovement);
router.post('/close', tillController.close);

// The history, with shortages and overs, is for the owner and managers.
router.get('/sessions', authorize(['Admin']), tillController.listSessions);
router.get('/sessions/:id', authorize(['Admin']), tillController.getSession);

module.exports = router;
