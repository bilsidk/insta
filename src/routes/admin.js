const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getStatus, updateSettings, setMode,
  promoteUser, grantCoins, getUsers, banUser,
} = require('../controllers/adminController');

const router = Router();
router.get('/status',      authenticate, getStatus);
router.patch('/settings',  authenticate, updateSettings);
router.post('/mode',       authenticate, setMode);
router.post('/promote',    authenticate, promoteUser);
router.post('/grant-coins', authenticate, grantCoins);
router.get('/users',       authenticate, getUsers);
router.post('/ban',        authenticate, banUser);

module.exports = router;
