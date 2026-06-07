const pool = require('../db/pool');

async function getMe(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT u.*,
              (SELECT COUNT(*) FROM completions WHERE user_id = u.id) AS tasks_completed,
              (SELECT COUNT(*) FROM tasks WHERE user_id = u.id) AS campaigns_count
       FROM users u WHERE u.id = $1`,
      [req.userId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: r.rows[0] });
  } catch (err) { next(err); }
}

async function deleteMe(req, res, next) {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.userId]);
    res.json({ ok: true, message: 'Account deleted.' });
  } catch (err) { next(err); }
}

module.exports = { getMe, deleteMe };
