const { Router } = require('express');
const { signIn, instagramCallback } = require('../controllers/authController');

const router = Router();
router.post('/instagram', signIn);
router.get('/instagram/callback', instagramCallback);

module.exports = router;
