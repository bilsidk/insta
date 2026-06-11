const pool = require('../db/pool');

let _modeCache = { mode: 'live', reason: null, at: 0 };
let _settingsCache = { data: null, at: 0 };
const TTL_MS = 30 * 1000;

let _failWindow = [];
const FAIL_WINDOW_MS = 5 * 60 * 1000;
const FAIL_THRESHOLD = 25;

const DEFAULTS = {
  daily_limit_user:         50,
  daily_limit_premium:      150,
  coins_follow:             5,
  coins_like:               3,
  coins_comment:            6,
  house_margin:             3,
  completion_delay_seconds: 30,
  max_campaigns_per_user:   5,
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
  console.log(`[APP MODE] switched to "${mode}"${reason ? ' — ' + reason : ''}`);
}

async function recordApiFailure(kind) {
  const now = Date.now();
  _failWindow.push(now);
  _failWindow = _failWindow.filter(t => now - t < FAIL_WINDOW_MS);
  if (_failWindow.length >= FAIL_THRESHOLD) {
    const current = await getMode();
    if (current.mode !== 'degraded') {
      await setMode('degraded', `Auto: ${_failWindow.length} API failures in 5m (last: ${kind})`);
    }
  }
}

async function recordApiSuccess() {
  _failWindow = [];
  // Don't auto-restore live — require admin to manually clear degraded mode
  // (prevents abuse: flood 25 failures → honor mode → 1 success → back to live → repeat)
}

module.exports = { getMode, getSettings, updateSettings, setMode, recordApiFailure, recordApiSuccess, DEFAULTS };
