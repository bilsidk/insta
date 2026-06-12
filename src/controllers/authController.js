const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const instagram = require('../services/instagramService');
const cfg = require('../config');

const BASE_URL = () => process.env.PUBLIC_BASE_URL || 'https://insta-production-91be.up.railway.app';

// In-memory session store for OAuth polling (TTL: 10 minutes)
const _sessions = new Map();
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of _sessions) { if (v.at < cutoff) _sessions.delete(k); }
}, 60 * 1000);

async function _upsertAccount(userInfo, accessToken, expiresIn, deviceId) {
  const expiry = new Date(Date.now() + (expiresIn || 5184000) * 1000);

  // Check history: block banned re-signups, skip bonus for returning users
  const hist = await pool.query(
    'SELECT bonus_granted, was_banned, ban_reason FROM account_history WHERE instagram_user_id = $1',
    [userInfo.instagramUserId]
  );
  const history = hist.rows[0];

  if (history?.was_banned) {
    const err = new Error(history.ban_reason || 'Account permanently banned');
    err.status = 403;
    err.code = 'ACCOUNT_BANNED';
    throw err;
  }

  const alreadyGotBonus = history?.bonus_granted || false;
  const startingCoins = alreadyGotBonus ? 0 : 50;

  const r = await pool.query(
    `INSERT INTO instagram_accounts
       (instagram_user_id, username, account_type, profile_pic_url, access_token, refresh_token, token_expiry, coins)
     VALUES ($1, $2, $3, $4, $5, $5, $6, $7)
     ON CONFLICT (instagram_user_id) DO UPDATE SET
       username        = EXCLUDED.username,
       account_type    = EXCLUDED.account_type,
       profile_pic_url = EXCLUDED.profile_pic_url,
       access_token    = EXCLUDED.access_token,
       refresh_token   = EXCLUDED.refresh_token,
       token_expiry    = EXCLUDED.token_expiry
     RETURNING id, (xmax = 0) AS is_new`,
    [userInfo.instagramUserId, userInfo.username, userInfo.accountType,
     userInfo.profilePicUrl, accessToken, expiry, startingCoins]
  );

  const { id, is_new } = r.rows[0];

  if (is_new && !alreadyGotBonus) {
    await pool.query(
      `INSERT INTO transactions (user_id, amount, type, description) VALUES ($1, 50, 'bonus', 'tx:welcome_bonus')`,
      [id]
    );
    await pool.query(
      `INSERT INTO account_history (instagram_user_id, bonus_granted, updated_at)
       VALUES ($1, TRUE, NOW())
       ON CONFLICT (instagram_user_id) DO UPDATE SET bonus_granted = TRUE, updated_at = NOW()`,
      [userInfo.instagramUserId]
    );
  }

  if (deviceId) {
    await pool.query('UPDATE instagram_accounts SET device_id = $1 WHERE id = $2', [deviceId, id]);
    await pool.query(
      `INSERT INTO device_accounts (device_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [deviceId, id]
    );
  }

  return id;
}

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

    if (device_id) {
      const deviceCount = await pool.query(
        'SELECT COUNT(DISTINCT user_id) AS n FROM device_accounts WHERE device_id = $1',
        [device_id]
      );
      if (parseInt(deviceCount.rows[0].n, 10) >= cfg.MAX_ACCOUNTS_PER_DEVICE)
        return res.status(403).json({ error: 'Too many accounts on this device.', code: 'DEVICE_LIMIT' });
    }

    const userId = await _upsertAccount(userInfo, accessToken, expiresIn, device_id);
    const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const { rows } = await pool.query('SELECT * FROM instagram_accounts WHERE id = $1', [userId]);
    res.json({ token, user: rows[0], instagram_connected: true });
  } catch (err) {
    if (err.code === 'ACCOUNT_BANNED') return res.status(403).json({ error: err.message, code: err.code });
    next(err);
  }
}

async function instagramCallback(req, res, next) {
  const BASE = BASE_URL();
  try {
    const { code: rawCode, error, state } = req.query;
    const code = rawCode?.split('#')[0];

    if (error || !code)
      return res.redirect(`${BASE}/auth/done?error=${encodeURIComponent(error || 'cancelled')}`);

    // Reject short/missing states — mitigates CSRF and session fixation
    if (!state || state.length < 16)
      return res.redirect(`${BASE}/auth/done?error=invalid_state`);

    const tokenResult = await instagram.exchangeCodeForToken(code);
    if (!tokenResult) return res.redirect(`${BASE}/auth/done?error=token_exchange_failed`);

    const longLived = await instagram.getLongLivedToken(tokenResult.accessToken);
    const accessToken = longLived?.accessToken || tokenResult.accessToken;
    const expiresIn   = longLived?.expiresIn   || tokenResult.expiresIn;

    const userInfo = await instagram.getInstagramUserInfo(accessToken);
    if (!userInfo) return res.redirect(`${BASE}/auth/done?error=profile_fetch_failed`);

    const userId = await _upsertAccount(userInfo, accessToken, expiresIn, null);
    const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });

    // Token goes into session store only — not in the redirect URL
    _sessions.set(state, { token, at: Date.now() });
    res.redirect(`${BASE}/auth/done?ok=1&sid=${encodeURIComponent(state)}`);
  } catch (err) {
    const BASE2 = BASE_URL();
    if (err.code === 'ACCOUNT_BANNED')
      return res.redirect(`${BASE2}/auth/done?error=${encodeURIComponent(err.message)}`);
    next(err);
  }
}

async function instagramStatus(req, res) {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });
  const entry = _sessions.get(session_id);
  if (!entry) return res.json({ ready: false });
  _sessions.delete(session_id);
  return res.json({ ready: true, token: entry.token });
}

module.exports = { signIn, instagramCallback, instagramStatus };
