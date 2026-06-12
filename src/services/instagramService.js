const axios = require('axios');
const pool = require('../db/pool');
const logger = require('../utils/logger');

// Instagram API with Instagram Login — tokens are only valid on graph.instagram.com
const API_BASE = 'https://graph.instagram.com/v22.0';

function isTransportError(err) {
  if (!err.response) return true; // network / timeout
  return err.response.status >= 500;
}

async function refreshToken(accountId) {
  const acc = await pool.query('SELECT access_token FROM instagram_accounts WHERE id = $1', [accountId]);
  const token = acc.rows[0]?.access_token;
  if (!token) return null;

  try {
    // IG-login long-lived tokens refresh via ig_refresh_token (token must be valid and >24h old)
    const { data } = await axios.get('https://graph.instagram.com/refresh_access_token', {
      params: {
        grant_type: 'ig_refresh_token',
        access_token: token,
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
    'SELECT id, access_token, token_expiry FROM instagram_accounts WHERE id = $1 AND is_active = TRUE',
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

// Current follower count of the campaign owner (their own token, /me)
async function getFollowersCount(ownerUserId) {
  const token = await getValidTokenForUser(ownerUserId);
  if (!token) return null;
  try {
    const { data } = await axios.get(`${API_BASE}/me`, {
      params: { access_token: token, fields: 'followers_count' },
    });
    return typeof data.followers_count === 'number' ? data.followers_count : null;
  } catch (err) {
    if (isTransportError(err)) throw err;
    logger.warn('followers_count fetch error', { ownerUserId, status: err.response?.status });
    throw err;
  }
}

// Current like count of a media object (owner token)
async function getLikeCount(ownerUserId, mediaId) {
  const token = await getValidTokenForUser(ownerUserId);
  if (!token) return null;
  try {
    const { data } = await axios.get(`${API_BASE}/${mediaId}`, {
      params: { access_token: token, fields: 'like_count' },
    });
    return typeof data.like_count === 'number' ? data.like_count : null;
  } catch (err) {
    if (isTransportError(err)) throw err;
    logger.warn('like_count fetch error', { ownerUserId, mediaId, status: err.response?.status });
    throw err;
  }
}

// Follow/like verification is count-delta based: the IG API exposes no follower or
// liker lists. Caller supplies the baseline recorded at task start plus how many
// other completions were verified since then.
async function verifyFollow(ownerUserId, baseline, verifiedSince = 0) {
  if (baseline === null || baseline === undefined) return null; // cannot API-verify
  const current = await getFollowersCount(ownerUserId);
  if (current === null) return null;
  return current >= baseline + verifiedSince + 1;
}

async function verifyLike(ownerUserId, mediaId, baseline, verifiedSince = 0) {
  if (baseline === null || baseline === undefined) return null;
  const current = await getLikeCount(ownerUserId, mediaId);
  if (current === null) return null;
  return current >= baseline + verifiedSince + 1;
}

// Comments are the only listable edge — exact per-user verification
async function verifyComment(ownerUserId, mediaId, userInstagramId, username) {
  const token = await getValidTokenForUser(ownerUserId);
  if (!token) return false;

  let after = null;
  for (let page = 0; page < 10; page++) {
    const params = { access_token: token, fields: 'from,text', limit: 50 };
    if (after) params.after = after;

    let data;
    try {
      ({ data } = await axios.get(`${API_BASE}/${mediaId}/comments`, { params }));
    } catch (err) {
      if (isTransportError(err)) throw err;
      logger.warn('Comment verification API error', { ownerUserId, mediaId, status: err.response?.status });
      throw err;
    }

    const found = data.data?.some(c =>
      String(c.from?.id) === String(userInstagramId) ||
      (username && c.from?.username && c.from.username.toLowerCase() === username.toLowerCase())
    );
    if (found) return true;

    after = data.paging?.cursors?.after;
    if (!after) break;
  }
  return false;
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
    logger.error('Long-lived token exchange failed', { error: err.response?.data || err.message });
    return null;
  }
}

async function getInstagramUserInfo(accessToken) {
  try {
    const { data } = await axios.get('https://graph.instagram.com/v22.0/me', {
      params: {
        access_token: accessToken,
        fields: 'id,username,name,profile_picture_url',
      },
    });
    return {
      instagramUserId: data.id,
      username: data.username || data.name || `user_${data.id}`,
      accountType: 'business',
      profilePicUrl: data.profile_picture_url || null,
    };
  } catch (err) {
    logger.error('Fetch user info failed', { error: err.response?.data || err.message });
    return null;
  }
}

module.exports = {
  verifyFollow, verifyLike, verifyComment,
  getFollowersCount, getLikeCount,
  fetchUserPosts, exchangeCodeForToken, getLongLivedToken,
  getInstagramUserInfo, getValidToken, getValidTokenForUser,
};
