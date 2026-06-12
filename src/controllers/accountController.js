const pool = require('../db/pool');
const instagram = require('../services/instagramService');

async function getMyPosts(req, res, next) {
  try {
    const acc = await pool.query(
      'SELECT * FROM instagram_accounts WHERE user_id = $1 AND is_active = TRUE LIMIT 1',
      [req.userId]
    );
    if (!acc.rows.length) return res.status(400).json({ error: 'No Instagram account connected' });

    const token = await instagram.getValidToken(acc.rows[0].id);
    if (!token) return res.status(400).json({ error: 'Instagram token expired. Reconnect.' });

    const posts = await instagram.fetchUserPosts(acc.rows[0].instagram_user_id, token);
    res.json({ posts });
  } catch (err) { next(err); }
}

async function disconnect(req, res, next) {
  try {
    await pool.query(
      "UPDATE instagram_accounts SET is_active = FALSE, access_token = NULL, refresh_token = NULL WHERE user_id = $1",
      [req.userId]
    );
    // Pause active campaigns so they stop appearing in the feed
    await pool.query(
      "UPDATE tasks SET status = 'paused' WHERE user_id = $1 AND status = 'active'",
      [req.userId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = { getMyPosts, disconnect };
