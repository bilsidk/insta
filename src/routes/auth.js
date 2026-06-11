const { Router } = require('express');
const { signIn, instagramCallback, instagramStatus } = require('../controllers/authController');

const router = Router();
router.post('/instagram', signIn);
router.get('/instagram/callback', instagramCallback);
router.get('/instagram/status', instagramStatus);

module.exports = router;
