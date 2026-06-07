const { Router } = require('express');
const { signIn } = require('../controllers/authController');

const router = Router();
router.post('/instagram', signIn);

module.exports = router;
