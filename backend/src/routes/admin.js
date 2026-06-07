const { Router } = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { getStatus, updateSettings, setMode, promoteUser } = require('../controllers/adminController');

async function requireOwner(req, res, next) {
  try {
    const r = await pool.query('SELECT role, email FROM users WHERE id = $1', [req.userId]);
    if (!r.rows.length || r.rows[0].role !== 'owner')
      return res.status(403).json({ error: 'Admin access required' });
    next();
  } catch (err) { next(err); }
}

const router = Router();
router.get('/status',    authenticate, requireOwner, getStatus);
router.patch('/settings', authenticate, requireOwner, updateSettings);
router.post('/mode',     authenticate, requireOwner, setMode);
router.post('/promote',  authenticate, requireOwner, promoteUser);

module.exports = router;
