const pool = require('../db/pool');

async function getMe(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT ia.id, ia.username, ia.username AS instagram_username, ia.profile_pic_url,
              ia.coins, ia.role, ia.is_premium, ia.is_banned, ia.created_at,
              (SELECT COUNT(*) FROM completions WHERE user_id = ia.id) AS tasks_completed,
              (SELECT COUNT(*) FROM tasks WHERE user_id = ia.id) AS campaigns_created
       FROM instagram_accounts ia
       WHERE ia.id = $1`,
      [req.userId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: r.rows[0] });
  } catch (err) { next(err); }
}

async function deleteMe(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      'DELETE FROM instagram_accounts WHERE id = $1 RETURNING id',
      [req.userId]
    );
    if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'User not found' }); }
    await client.query('COMMIT');
    res.json({ ok: true, message: 'Account permanently deleted.' });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
}

module.exports = { getMe, deleteMe };
