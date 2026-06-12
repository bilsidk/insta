const pool = require('../db/pool');

async function getTransactions(req, res, next) {
  try {
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const r = await pool.query(
      'SELECT id, amount, type, description, created_at FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [req.userId, limit, offset]
    );
    const total = await pool.query('SELECT COUNT(*) FROM transactions WHERE user_id = $1', [req.userId]);
    res.json({ transactions: r.rows, total: parseInt(total.rows[0].count), limit, offset });
  } catch (err) { next(err); }
}

module.exports = { getTransactions };
