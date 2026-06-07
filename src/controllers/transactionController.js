const pool = require('../db/pool');

async function getTransactions(req, res, next) {
  try {
    const r = await pool.query(
      'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
      [req.userId]
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

module.exports = { getTransactions };
