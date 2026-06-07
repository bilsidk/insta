const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const instagram = require('../services/instagramService');

async function signIn(req, res, next) {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Authorization code required' });

    const tokenResult = await instagram.exchangeCodeForToken(code);
    if (!tokenResult) return res.status(400).json({ error: 'Token exchange failed' });

    const longLived = await instagram.getLongLivedToken(tokenResult.accessToken);
    const accessToken = longLived?.accessToken || tokenResult.accessToken;
    const expiresIn = longLived?.expiresIn || tokenResult.expiresIn;

    const userInfo = await instagram.getInstagramUserInfo(accessToken);
    if (!userInfo) return res.status(400).json({ error: 'Could not fetch Instagram profile' });

    const existingAccount = await pool.query(
      'SELECT user_id FROM instagram_accounts WHERE instagram_user_id = $1',
      [userInfo.instagramUserId]
    );

    let user;
    if (existingAccount.rows.length) {
      const r = await pool.query('SELECT * FROM users WHERE id = $1', [existingAccount.rows[0].user_id]);
      user = r.rows[0];
    } else {
      const r = await pool.query(
        'INSERT INTO users (name, avatar, coins) VALUES ($1, $2, 50) RETURNING *',
        [userInfo.username, userInfo.profilePicUrl]
      );
      user = r.rows[0];
      await pool.query(
        `INSERT INTO transactions (user_id, amount, type, description) VALUES ($1, 50, 'bonus', 'tx:welcome_bonus')`,
        [user.id]
      );
    }

    const expiry = new Date(Date.now() + expiresIn * 1000);
    await pool.query(
      `INSERT INTO instagram_accounts (user_id, instagram_user_id, username, account_type, profile_pic_url, access_token, token_expiry)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (instagram_user_id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         username = EXCLUDED.username,
         account_type = EXCLUDED.account_type,
         profile_pic_url = EXCLUDED.profile_pic_url,
         access_token = EXCLUDED.access_token,
         token_expiry = EXCLUDED.token_expiry,
         is_active = TRUE`,
      [user.id, userInfo.instagramUserId, userInfo.username, userInfo.accountType, userInfo.profilePicUrl, accessToken, expiry]
    );

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user, instagram_connected: true });
  } catch (err) { next(err); }
}

module.exports = { signIn };
