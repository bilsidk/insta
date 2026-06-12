const pool = require('../db/pool');
const instagram = require('../services/instagramService');

async function getMyPosts(req, res, next) {
  try {
    const token = await instagram.getValidToken(req.userId);
    if (!token) return res.status(400).json({ error: 'Instagram token expired. Reconnect.' });

    const acc = await pool.query(
      'SELECT instagram_user_id FROM instagram_accounts WHERE id = $1',
      [req.userId]
    );
    if (!acc.rows.length) return res.status(400).json({ error: 'No Instagram account connected' });

    const posts = await instagram.fetchUserPosts(acc.rows[0].instagram_user_id, token);
    res.json({ posts });
  } catch (err) { next(err); }
}

async function disconnect(req, res, next) {
  try {
    await pool.query(
      "UPDATE instagram_accounts SET access_token = NULL, refresh_token = NULL WHERE id = $1",
      [req.userId]
    );
    await pool.query(
      "UPDATE tasks SET status = 'paused' WHERE user_id = $1 AND status = 'active'",
      [req.userId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = { getMyPosts, disconnect };
