const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const instagram = require('../services/instagramService');
const cfg = require('../config');

async function signIn(req, res, next) {
  try {
    const { code, device_id } = req.body;
    if (!code) return res.status(400).json({ error: 'Authorization code required' });

    const tokenResult = await instagram.exchangeCodeForToken(code);
    if (!tokenResult) return res.status(400).json({ error: 'Token exchange failed' });

    const longLived = await instagram.getLongLivedToken(tokenResult.accessToken);
    const accessToken = longLived?.accessToken || tokenResult.accessToken;
    const expiresIn   = longLived?.expiresIn   || tokenResult.expiresIn;

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
      // Device-level guard: limit welcome bonus farming
      // A device can sign up with at most MAX_ACCOUNTS_PER_DEVICE different IG accounts
      if (device_id) {
        const deviceCount = await pool.query(
          'SELECT COUNT(DISTINCT user_id) AS n FROM device_accounts WHERE device_id = $1',
          [device_id]
        );
        if (parseInt(deviceCount.rows[0].n, 10) >= cfg.MAX_ACCOUNTS_PER_DEVICE) {
          return res.status(403).json({ error: 'Too many accounts on this device.', code: 'DEVICE_LIMIT' });
        }
      }

      // Use INSERT ... ON CONFLICT to prevent race-condition duplicate users
      const r = await pool.query(
        `INSERT INTO users (name, avatar, coins) VALUES ($1, $2, 50)
         ON CONFLICT DO NOTHING RETURNING *`,
        [userInfo.username, userInfo.profilePicUrl]
      );
      if (!r.rows.length) {
        // Race condition: another request created the user — fetch it
        const r2 = await pool.query(
          'SELECT u.* FROM users u JOIN instagram_accounts ia ON ia.user_id = u.id WHERE ia.instagram_user_id = $1',
          [userInfo.instagramUserId]
        );
        user = r2.rows[0];
      } else {
        user = r.rows[0];
        await pool.query(
          `INSERT INTO transactions (user_id, amount, type, description) VALUES ($1, 50, 'bonus', 'tx:welcome_bonus')`,
          [user.id]
        );
      }
    }

    if (!user) return res.status(500).json({ error: 'User creation failed' });

    const expiry = new Date(Date.now() + (expiresIn || 5184000) * 1000);
    await pool.query(
      `INSERT INTO instagram_accounts
         (user_id, instagram_user_id, username, account_type, profile_pic_url, access_token, refresh_token, token_expiry)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7)
       ON CONFLICT (instagram_user_id) DO UPDATE SET
         user_id       = EXCLUDED.user_id,
         username      = EXCLUDED.username,
         account_type  = EXCLUDED.account_type,
         profile_pic_url = EXCLUDED.profile_pic_url,
         access_token  = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         token_expiry  = EXCLUDED.token_expiry,
         is_active     = TRUE`,
      [user.id, userInfo.instagramUserId, userInfo.username, userInfo.accountType,
       userInfo.profilePicUrl, accessToken, expiry]
    );

    // Register device to enable per-device account limits
    if (device_id) {
      await pool.query('UPDATE users SET device_id = $1 WHERE id = $2', [device_id, user.id]);
      await pool.query(
        `INSERT INTO device_accounts (device_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [device_id, user.id]
      );
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user, instagram_connected: true });
  } catch (err) { next(err); }
}

async function instagramCallback(req, res, next) {
  try {
    const { code: rawCode, error } = req.query;
    const code = rawCode?.split('#')[0]; // strip #_ fragment Instagram sometimes appends

    if (error || !code) {
      return res.redirect(`com.instagrowth://auth?error=${encodeURIComponent(error || 'cancelled')}`);
    }

    console.log('[Callback] exchanging code:', code?.slice(0, 20), 'at', new Date().toISOString());
    const tokenResult = await instagram.exchangeCodeForToken(code);
    console.log('[Callback] tokenResult:', tokenResult ? 'success' : 'failed');
    if (!tokenResult) return res.redirect('com.instagrowth://auth?error=token_exchange_failed');

    const longLived = await instagram.getLongLivedToken(tokenResult.accessToken);
    const accessToken = longLived?.accessToken || tokenResult.accessToken;
    const expiresIn   = longLived?.expiresIn   || tokenResult.expiresIn;

    const userInfo = await instagram.getInstagramUserInfo(accessToken);
    if (!userInfo) return res.redirect('com.instagrowth://auth?error=profile_fetch_failed');

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
        `INSERT INTO users (name, avatar, coins) VALUES ($1, $2, 50) ON CONFLICT DO NOTHING RETURNING *`,
        [userInfo.username, userInfo.profilePicUrl]
      );
      if (!r.rows.length) {
        const r2 = await pool.query(
          'SELECT u.* FROM users u JOIN instagram_accounts ia ON ia.user_id = u.id WHERE ia.instagram_user_id = $1',
          [userInfo.instagramUserId]
        );
        user = r2.rows[0];
      } else {
        user = r.rows[0];
        await pool.query(
          `INSERT INTO transactions (user_id, amount, type, description) VALUES ($1, 50, 'bonus', 'tx:welcome_bonus')`,
          [user.id]
        );
      }
    }

    if (!user) return res.redirect('com.instagrowth://auth?error=user_creation_failed');

    const expiry = new Date(Date.now() + (expiresIn || 5184000) * 1000);
    await pool.query(
      `INSERT INTO instagram_accounts
         (user_id, instagram_user_id, username, account_type, profile_pic_url, access_token, refresh_token, token_expiry)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7)
       ON CONFLICT (instagram_user_id) DO UPDATE SET
         user_id = EXCLUDED.user_id, username = EXCLUDED.username,
         account_type = EXCLUDED.account_type, profile_pic_url = EXCLUDED.profile_pic_url,
         access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
         token_expiry = EXCLUDED.token_expiry, is_active = TRUE`,
      [user.id, userInfo.instagramUserId, userInfo.username, userInfo.accountType,
       userInfo.profilePicUrl, accessToken, expiry]
    );

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.redirect(`com.instagrowth://auth?token=${encodeURIComponent(token)}`);
  } catch (err) { next(err); }
}

module.exports = { signIn, instagramCallback };
