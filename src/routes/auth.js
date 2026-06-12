const { Router } = require('express');
const { signIn, instagramCallback, instagramStatus } = require('../controllers/authController');

const router = Router();
router.post('/instagram', signIn);
router.get('/instagram/callback', instagramCallback);
router.get('/instagram/status', instagramStatus);
router.get('/done', (req, res) => res.send(''));

module.exports = router;
