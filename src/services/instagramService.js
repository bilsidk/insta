const axios = require('axios');
const pool = require('../db/pool');
const logger = require('../utils/logger');

const API_BASE = 'https://graph.facebook.com/v22.0';

async function refreshToken(accountId) {
  const acc = await pool.query('SELECT refresh_token, access_token FROM instagram_accounts WHERE id = $1', [accountId]);
  const token = acc.rows[0]?.refresh_token || acc.rows[0]?.access_token;
  if (!token) return null;

  try {
    const { data } = await axios.get(`${API_BASE}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.INSTAGRAM_APP_ID,
        client_secret: process.env.INSTAGRAM_APP_SECRET,
        fb_exchange_token: token,
      },
    });
    const newExpiry = new Date(Date.now() + (data.expires_in || 60 * 24 * 3600) * 1000);
    await pool.query(
      `UPDATE instagram_accounts SET access_token = $1, refresh_token = $1, token_expiry = $2 WHERE id = $3`,
      [data.access_token, newExpiry, accountId]
    );
    return data.access_token;
  } catch (err) {
    logger.error('Token refresh failed', { accountId, error: err.message });
    return null;
  }
}

async function getValidToken(accountId) {
  const acc = await pool.query(
    'SELECT id, access_token, token_expiry, refresh_token FROM instagram_accounts WHERE id = $1 AND is_active = TRUE',
    [accountId]
  );
  if (!acc.rows.length) return null;
  const row = acc.rows[0];

  if (row.token_expiry && new Date() >= new Date(row.token_expiry)) {
    const newToken = await refreshToken(accountId);
    if (newToken) return newToken;
    return null;
  }
  return row.access_token;
}

async function getValidTokenForUser(userId) {
  return getValidToken(userId);
}

async function verifyFollow(ownerUserId, followerInstagramId) {
  const token = await getValidTokenForUser(ownerUserId);
  if (!token) return false;

  try {
    const ownerAcc = await pool.query(
      'SELECT instagram_user_id FROM instagram_accounts WHERE id = $1',
      [ownerUserId]
    );
    const ownerIgId = ownerAcc.rows[0]?.instagram_user_id;
    if (!ownerIgId) return false;

    let after = null;
    for (let page = 0; page < 10; page++) {
      const params = { access_token: token, limit: 200 };
      if (after) params.after = after;

      const { data } = await axios.get(`${API_BASE}/${ownerIgId}/followers`, { params });
      const found = data.data?.some(u => String(u.id) === String(followerInstagramId));
      if (found) return true;

      after = data.paging?.cursors?.after;
      if (!after) break;
    }
    return false;
  } catch (err) {
    logger.warn('Follow verification failed', { ownerUserId, error: err.message });
    return false;
  }
}

async function verifyLike(mediaId, userInstagramId) {
  const { rows } = await pool.query(
    `SELECT t.user_id FROM tasks t JOIN instagram_accounts ia ON ia.id = t.account_id
     WHERE t.instagram_media_id = $1 LIMIT 1`,
    [mediaId]
  );
  if (!rows.length) return false;
  const token = await getValidTokenForUser(rows[0].user_id);
  if (!token) return false;

  try {
    let after = null;
    for (let page = 0; page < 10; page++) {
      const params = { access_token: token, limit: 200 };
      if (after) params.after = after;

      const { data } = await axios.get(`${API_BASE}/${mediaId}/likes`, { params });
      const found = data.data?.some(u => String(u.id) === String(userInstagramId));
      if (found) return true;

      after = data.paging?.cursors?.after;
      if (!after) break;
    }
    return false;
  } catch (err) {
    logger.warn('Like verification failed', { mediaId, error: err.message });
    return false;
  }
}

async function verifyComment(mediaId, userInstagramId) {
  const { rows } = await pool.query(
    `SELECT t.user_id FROM tasks t JOIN instagram_accounts ia ON ia.id = t.account_id
     WHERE t.instagram_media_id = $1 LIMIT 1`,
    [mediaId]
  );
  if (!rows.length) return false;
  const token = await getValidTokenForUser(rows[0].user_id);
  if (!token) return false;

  try {
    let after = null;
    for (let page = 0; page < 10; page++) {
      const params = { access_token: token, limit: 200 };
      if (after) params.after = after;

      const { data } = await axios.get(`${API_BASE}/${mediaId}/comments`, { params });
      const found = data.data?.some(c => String(c.from?.id || c.user?.id) === String(userInstagramId));
      if (found) return true;

      after = data.paging?.cursors?.after;
      if (!after) break;
    }
    return false;
  } catch (err) {
    logger.warn('Comment verification failed', { mediaId, error: err.message });
    return false;
  }
}

async function fetchUserPosts(instagramUserId, accessToken) {
  try {
    const { data } = await axios.get(`${API_BASE}/${instagramUserId}/media`, {
      params: {
        access_token: accessToken,
        fields: 'id,media_type,thumbnail_url,permalink,caption',
        limit: 50,
      },
    });
    return data.data || [];
  } catch (err) {
    logger.error('Fetch posts failed', { instagramUserId, error: err.message });
    return [];
  }
}

async function exchangeCodeForToken(code) {
  try {
    const params = new URLSearchParams();
    params.append('client_id', process.env.INSTAGRAM_APP_ID);
    params.append('client_secret', process.env.INSTAGRAM_APP_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('redirect_uri', process.env.INSTAGRAM_REDIRECT_URI);
    params.append('code', code);

    const { data } = await axios.post(
      'https://api.instagram.com/oauth/access_token',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  } catch (err) {
    logger.error('Token exchange failed', { error: err.response?.data || err.message });
    return null;
  }
}

async function getLongLivedToken(shortLivedToken) {
  try {
    const { data } = await axios.get('https://graph.instagram.com/access_token', {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: process.env.INSTAGRAM_APP_SECRET,
        access_token: shortLivedToken,
      },
    });
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  } catch (err) {
    console.error('Long-lived token exchange failed:', JSON.stringify(err.response?.data || err.message));
    return null;
  }
}

async function getInstagramUserInfo(accessToken) {
  try {
    const { data } = await axios.get('https://graph.instagram.com/v22.0/me', {
      params: {
        access_token: accessToken,
        fields: 'id,username,name',
      },
    });
    console.log('Instagram user info:', JSON.stringify(data));
    return {
      instagramUserId: data.id,
      username: data.username || data.name || `user_${data.id}`,
      accountType: 'business',
      profilePicUrl: null,
    };
  } catch (err) {
    console.error('Fetch user info failed:', JSON.stringify(err.response?.data || err.message));
    return null;
  }
}

module.exports = {
  verifyFollow, verifyLike, verifyComment,
  fetchUserPosts, exchangeCodeForToken, getLongLivedToken,
  getInstagramUserInfo, getValidToken, getValidTokenForUser,
};
