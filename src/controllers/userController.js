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
      'SELECT instagram_user_id, is_banned, ban_reason FROM instagram_accounts WHERE id = $1',
      [req.userId]
    );
    if (!r.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    const { instagram_user_id, is_banned, ban_reason } = r.rows[0];

    // Preserve ban status and bonus grant in history so re-signup can't evade bans or farm bonus
    await client.query(
      `INSERT INTO account_history (instagram_user_id, bonus_granted, was_banned, ban_reason, updated_at)
       VALUES ($1, TRUE, $2, $3, NOW())
       ON CONFLICT (instagram_user_id) DO UPDATE SET
         was_banned = account_history.was_banned OR $2,
         ban_reason = CASE WHEN $2 THEN $3 ELSE account_history.ban_reason END,
         bonus_granted = TRUE,
         updated_at = NOW()`,
      [instagram_user_id, is_banned, ban_reason]
    );

    await client.query('DELETE FROM instagram_accounts WHERE id = $1', [req.userId]);
    await client.query('COMMIT');
    res.json({ ok: true, message: 'Account permanently deleted.' });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
}

module.exports = { getMe, deleteMe };
