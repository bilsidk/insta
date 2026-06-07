const pool = require('../db/pool');
const settings = require('../services/settingsService');
const cfg = require('../config');

const ALLOWED_KEYS = new Set([
  'daily_limit_user', 'daily_limit_premium',
  'coins_follow', 'coins_like', 'coins_comment',
  'coins_per_slot', 'completion_delay_seconds', 'max_campaigns_per_user',
]);

async function getStatus(req, res, next) {
  try {
    const mode = await settings.getMode();
    const sets = await settings.getSettings();
    const stats = await pool.query(
      `SELECT (SELECT COUNT(*) FROM users) AS total_users,
              (SELECT COUNT(*) FROM tasks WHERE status = 'active') AS active_campaigns,
              (SELECT COUNT(*) FROM completions WHERE completed_at > NOW() - INTERVAL '24 hours') AS daily_completions,
              (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'spent' AND created_at > NOW() - INTERVAL '24 hours') AS daily_revenue`
    );
    res.json({ mode: mode.mode, reason: mode.reason, settings: sets, stats: stats.rows[0] });
  } catch (err) { next(err); }
}

async function updateSettings(req, res, next) {
  try {
    const updates = {};
    for (const key of Object.keys(req.body)) {
      if (ALLOWED_KEYS.has(key)) {
        const val = parseInt(req.body[key], 10);
        if (!isNaN(val) && val >= 0) updates[key] = val;
      }
    }
    if (Object.keys(updates).length) await settings.updateSettings(updates);
    res.json({ ok: true, updated: updates });
  } catch (err) { next(err); }
}

async function setMode(req, res, next) {
  try {
    const { mode, reason } = req.body;
    if (!['live', 'degraded'].includes(mode)) return res.status(400).json({ error: 'Mode must be live or degraded' });
    await settings.setMode(mode, reason || null);
    res.json({ ok: true, mode });
  } catch (err) { next(err); }
}

async function promoteUser(req, res, next) {
  try {
    const { userId, role } = req.body;
    if (!userId || !['premium', 'user'].includes(role))
      return res.status(400).json({ error: 'userId and role (premium/user) required' });
    await pool.query(
      role === 'premium'
        ? 'UPDATE users SET role = $1, is_premium = TRUE WHERE id = $2'
        : 'UPDATE users SET role = $1, is_premium = FALSE WHERE id = $2',
      [role, userId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = { getStatus, updateSettings, setMode, promoteUser };
