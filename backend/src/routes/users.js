const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { getMe, deleteMe } = require('../controllers/userController');

const router = Router();
router.get('/me', authenticate, getMe);
router.delete('/me', authenticate, deleteMe);

module.exports = router;
