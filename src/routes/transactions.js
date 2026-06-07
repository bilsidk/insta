const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { getTransactions } = require('../controllers/transactionController');

const router = Router();
router.get('/', authenticate, getTransactions);

module.exports = router;
