const pool = require('../db/pool');

async function getMe(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT u.id, u.name, u.avatar, u.coins, u.role, u.is_premium, u.is_banned, u.created_at,
              ia.username AS instagram_username, ia.profile_pic_url,
              (SELECT COUNT(*) FROM completions WHERE user_id = u.id) AS tasks_completed,
              (SELECT COUNT(*) FROM tasks WHERE user_id = u.id) AS campaigns_created
       FROM users u
       LEFT JOIN instagram_accounts ia ON ia.user_id = u.id
       WHERE u.id = $1`,
      [req.userId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: r.rows[0] });
  } catch (err) { next(err); }
}

async function deleteMe(req, res, next) {
  const client = await pool.connect();
  try {
    const userId = req.userId;
    await client.query('BEGIN');
    await client.query(`DELETE FROM completions WHERE task_id IN (SELECT t.id FROM tasks t JOIN instagram_accounts ia ON ia.id = t.account_id WHERE ia.user_id = $1)`, [userId]);
    await client.query('DELETE FROM completions WHERE user_id = $1', [userId]);
    await client.query(`DELETE FROM tasks WHERE account_id IN (SELECT id FROM instagram_accounts WHERE user_id = $1)`, [userId]);
    await client.query('DELETE FROM transactions WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM device_accounts WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM instagram_accounts WHERE user_id = $1', [userId]);
    const r = await client.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
    if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'User not found' }); }
    await client.query('COMMIT');
    res.json({ ok: true, message: 'Account permanently deleted.' });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
}

module.exports = { getMe, deleteMe };
