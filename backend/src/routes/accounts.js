const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { getMyPosts, disconnect } = require('../controllers/accountController');

const router = Router();
router.get('/posts', authenticate, getMyPosts);
router.post('/disconnect', authenticate, disconnect);

module.exports = router;
