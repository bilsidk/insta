const pool = require('../db/pool');

let _modeCache = { mode: 'live', reason: null, at: 0 };
let _settingsCache = { data: null, at: 0 };
const TTL_MS = 30 * 1000;

const DEFAULTS = {
  daily_limit_user: 50,
  daily_limit_premium: 100,
  coins_follow: 5,
  coins_like: 3,
  coins_comment: 6,
  coins_per_slot: 8,
  completion_delay_seconds: 30,
  max_campaigns_per_user: 5,
};

async function getMode() {
  const now = Date.now();
  if (now - _modeCache.at < TTL_MS) return _modeCache;
  try {
    const res = await pool.query('SELECT api_mode, degraded_reason FROM app_settings WHERE id = 1');
    const row = res.rows[0] || { api_mode: 'live', degraded_reason: null };
    _modeCache = { mode: row.api_mode, reason: row.degraded_reason, at: now };
  } catch {
    _modeCache = { mode: 'live', reason: null, at: now };
  }
  return _modeCache;
}

async function getSettings() {
  const now = Date.now();
  if (_settingsCache.data && now - _settingsCache.at < TTL_MS) return _settingsCache.data;
  try {
    const res = await pool.query('SELECT settings FROM app_settings WHERE id = 1');
    const data = { ...DEFAULTS, ...(res.rows[0]?.settings || {}) };
    _settingsCache = { data, at: now };
    return data;
  } catch {
    return DEFAULTS;
  }
}

async function updateSettings(updates) {
  await pool.query(
    `UPDATE app_settings SET settings = settings || $1::jsonb, updated_at = NOW() WHERE id = 1`,
    [JSON.stringify(updates)]
  );
  _settingsCache = { data: null, at: 0 };
}

async function setMode(mode, reason = null) {
  await pool.query(
    `UPDATE app_settings SET api_mode = $1, degraded_reason = $2, updated_at = NOW() WHERE id = 1`,
    [mode, reason]
  );
  _modeCache = { mode, reason, at: Date.now() };
}

module.exports = { getMode, getSettings, updateSettings, setMode, DEFAULTS };
