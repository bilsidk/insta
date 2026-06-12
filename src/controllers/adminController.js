const pool = require('../db/pool');
const settings = require('../services/settingsService');
const cfg = require('../config');

async function requireOwner(req, res) {
  const r = await pool.query('SELECT role FROM instagram_accounts WHERE id = $1', [req.userId]);
  if (r.rows[0]?.role !== 'owner') { res.status(403).json({ error: 'Owner only' }); return false; }
  return true;
}

async function getStatus(req, res, next) {
  try {
    if (!(await requireOwner(req, res))) return;
    const [mode, appSettings, stats] = await Promise.all([
      settings.getMode(),
      settings.getSettings(),
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM instagram_accounts)                                AS users,
          (SELECT COUNT(*) FROM instagram_accounts WHERE role = 'premium')         AS premium_users,
          (SELECT COUNT(*) FROM instagram_accounts WHERE is_banned = TRUE)         AS banned_users,
          (SELECT COUNT(*) FROM tasks WHERE status = 'active')                     AS active_tasks,
          (SELECT COUNT(*) FROM completions WHERE verify_status = 'verified')      AS verified_completions,
          (SELECT COUNT(*) FROM completions WHERE verify_status = 'pending')       AS pending_completions,
          (SELECT COUNT(*) FROM completions WHERE verify_status = 'reclaimed')     AS reclaimed_completions,
          (SELECT COALESCE(SUM(coins), 0) FROM instagram_accounts)                 AS total_coins_in_circulation
      `),
    ]);
    res.json({ api_mode: mode.mode, degraded_reason: mode.reason, settings: appSettings, stats: stats.rows[0] });
  } catch (err) { next(err); }
}

async function updateSettings(req, res, next) {
  try {
    if (!(await requireOwner(req, res))) return;
    const allowed = [
      'daily_limit_user', 'daily_limit_premium',
      'coins_follow', 'coins_like', 'coins_comment',
      'house_margin', 'completion_delay_seconds', 'max_campaigns_per_user',
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const val = parseInt(req.body[key], 10);
        if (!isNaN(val) && val >= 0) updates[key] = val;
      }
    }
    if (!Object.keys(updates).length)
      return res.status(400).json({ error: 'No valid settings provided' });
    await settings.updateSettings(updates);
    res.json({ ok: true, settings: await settings.getSettings() });
  } catch (err) { next(err); }
}

async function setMode(req, res, next) {
  try {
    if (!(await requireOwner(req, res))) return;
    const { mode, reason } = req.body;
    if (!['live', 'degraded'].includes(mode))
      return res.status(400).json({ error: "mode must be 'live' or 'degraded'" });
    await settings.setMode(mode, reason || (mode === 'degraded' ? 'Manual: owner switch' : null));
    res.json({ ok: true, api_mode: mode });
  } catch (err) { next(err); }
}

// Resolves a target account to exactly one id. Prefers an explicit user_id;
// falls back to username but REFUSES when the username is ambiguous — usernames
// are not unique in the schema (only instagram_user_id is), so a rename collision
// could otherwise mutate the wrong account (or every match).
async function resolveTargetId(body, res) {
  if (body.user_id !== undefined && body.user_id !== null && body.user_id !== '') {
    const id = parseInt(body.user_id, 10);
    if (!Number.isInteger(id)) { res.status(400).json({ error: 'Invalid user_id' }); return null; }
    const r = await pool.query('SELECT id FROM instagram_accounts WHERE id = $1', [id]);
    if (!r.rows.length) { res.status(404).json({ error: 'User not found' }); return null; }
    return id;
  }
  if (!body.username) { res.status(400).json({ error: 'username or user_id required' }); return null; }
  const r = await pool.query(
    'SELECT id FROM instagram_accounts WHERE LOWER(username) = LOWER($1)', [body.username]
  );
  if (!r.rows.length) { res.status(404).json({ error: 'User not found' }); return null; }
  if (r.rows.length > 1) {
    res.status(409).json({ error: `Multiple accounts use "${body.username}" — search and target the exact user.`, code: 'AMBIGUOUS_USERNAME' });
    return null;
  }
  return r.rows[0].id;
}

async function promoteUser(req, res, next) {
  try {
    if (!(await requireOwner(req, res))) return;
    const { role } = req.body;
    if (!['premium', 'user'].includes(role))
      return res.status(400).json({ error: 'role (premium/user) required' });
    const id = await resolveTargetId(req.body, res);
    if (id === null) return;
    const r = await pool.query(
      `UPDATE instagram_accounts SET role = $1, is_premium = $2 WHERE id = $3 RETURNING id, role`,
      [role, role === 'premium', id]
    );
    res.json({ ok: true, user: r.rows[0] });
  } catch (err) { next(err); }
}

async function grantCoins(req, res, next) {
  try {
    if (!(await requireOwner(req, res))) return;
    const coins = parseInt(req.body.amount, 10);
    if (isNaN(coins) || coins <= 0)
      return res.status(400).json({ error: 'positive amount required' });
    const id = await resolveTargetId(req.body, res);
    if (id === null) return;
    const r = await pool.query(
      `UPDATE instagram_accounts SET coins = coins + $1 WHERE id = $2 RETURNING id, username, coins`,
      [coins, id]
    );
    await pool.query(
      `INSERT INTO transactions (user_id, amount, type, description) VALUES ($1, $2, 'bonus', 'admin:manual_grant')`,
      [r.rows[0].id, coins]
    );
    res.json({ ok: true, username: r.rows[0].username, granted: coins, new_balance: r.rows[0].coins });
  } catch (err) { next(err); }
}

async function getUsers(req, res, next) {
  try {
    if (!(await requireOwner(req, res))) return;
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = 50;
    const offset = (page - 1) * limit;
    const search = req.query.username ? `%${req.query.username.toLowerCase()}%` : null;
    const where  = search ? `WHERE LOWER(ia.username) LIKE $3` : '';
    const params = search ? [limit, offset, search] : [limit, offset];

    const r = await pool.query(
      `SELECT ia.id, ia.username, ia.username AS instagram_username, ia.profile_pic_url,
              ia.coins, ia.role, ia.is_banned, ia.ban_reason,
              ia.trust_score, ia.reclaim_count, ia.created_at,
              (SELECT COUNT(*) FROM completions WHERE user_id = ia.id) AS tasks_completed
       FROM instagram_accounts ia
       ${where}
       ORDER BY ia.created_at DESC LIMIT $1 OFFSET $2`,
      params
    );
    const total = await pool.query(
      `SELECT COUNT(*) FROM instagram_accounts ia ${where}`,
      search ? [search] : []
    );
    res.json({ users: r.rows, total: parseInt(total.rows[0].count), page, pages: Math.ceil(total.rows[0].count / limit) });
  } catch (err) { next(err); }
}

async function banUser(req, res, next) {
  try {
    if (!(await requireOwner(req, res))) return;
    const { reason, unban } = req.body;
    const id = await resolveTargetId(req.body, res);
    if (id === null) return;

    if (unban) {
      const r = await pool.query(
        `UPDATE instagram_accounts SET is_banned = FALSE, ban_reason = NULL, banned_at = NULL
         WHERE id = $1 RETURNING id, is_banned`,
        [id]
      );
      return res.json({ ok: true, user: r.rows[0] });
    }
    const r = await pool.query(
      `UPDATE instagram_accounts SET is_banned = TRUE, ban_reason = $2, banned_at = NOW()
       WHERE id = $1 RETURNING id, is_banned, ban_reason`,
      [id, reason || 'Banned by admin']
    );
    res.json({ ok: true, user: r.rows[0] });
  } catch (err) { next(err); }
}

module.exports = { getStatus, updateSettings, setMode, promoteUser, grantCoins, getUsers, banUser };
