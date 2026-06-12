const pool = require('../db/pool');
const axios = require('axios');
const { Resend } = require('resend');
const logger = require('../utils/logger');

let _modeCache = { mode: 'live', reason: null, at: 0 };
let _settingsCache = { data: null, at: 0 };
const TTL_MS = 30 * 1000;

let _failWindow = [];
const FAIL_WINDOW_MS = 5 * 60 * 1000;
const FAIL_THRESHOLD = 25;

const RECOVERY_INTERVAL_MS = 30 * 60 * 1000;
let _recoveryTimer = null;

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

// ─── Email ────────────────────────────────────────────────────────────────────

async function _sendAlert(subject, text) {
  const to = process.env.ALERT_EMAIL;
  if (!to) { logger.warn('[ALERT] ALERT_EMAIL not set — skipping email'); return; }
  if (!process.env.RESEND_API_KEY) { logger.warn('[ALERT] RESEND_API_KEY not set — skipping email'); return; }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'InstaGrowth <onboarding@resend.dev>',
      to,
      subject,
      text,
    });
    logger.info(`[ALERT] Email sent: ${subject}`);
  } catch (err) {
    logger.error('[ALERT] Email failed', { error: err.message });
  }
}

// ─── Instagram API probe ──────────────────────────────────────────────────────

async function probeInstagramApi() {
  try {
    // Grab any valid token from DB to make a real API call
    const res = await pool.query(
      `SELECT access_token FROM instagram_accounts
       WHERE is_active = TRUE AND token_expiry > NOW()
       ORDER BY last_task_at DESC NULLS LAST LIMIT 1`
    );
    if (!res.rows.length) {
      // No tokens available — just check if the endpoint is reachable
      await axios.get('https://graph.facebook.com/', { timeout: 8000 });
      return true;
    }
    const token = res.rows[0].access_token;
    await axios.get('https://graph.facebook.com/v22.0/me', {
      params: { fields: 'id', access_token: token },
      timeout: 8000,
    });
    return true;
  } catch (err) {
    const status = err.response?.status;
    // 400/401 means API is reachable but token issue — API itself is UP
    if (status === 400 || status === 401) return true;
    logger.warn('[PROBE] Instagram API probe failed', { error: err.message });
    return false;
  }
}

// ─── Recovery timer ───────────────────────────────────────────────────────────

function _stopRecoveryTimer() {
  if (_recoveryTimer) {
    clearInterval(_recoveryTimer);
    _recoveryTimer = null;
  }
}

function _startRecoveryTimer() {
  if (_recoveryTimer) return;
  logger.info('[RECOVERY] Starting 30-min recovery check timer');
  _recoveryTimer = setInterval(async () => {
    try {
      const current = await getMode();
      if (current.mode !== 'degraded') { _stopRecoveryTimer(); return; }

      logger.info('[RECOVERY] Probing Instagram API...');
      const ok = await probeInstagramApi();
      if (ok) {
        await setMode('live', null);
        _stopRecoveryTimer();
        _failWindow = [];
        await _sendAlert(
          '✅ InstaGrowth — API recovered (auto)',
          `Instagram API is responding again.\nMode switched back to LIVE automatically at ${new Date().toISOString()}.`
        );
      } else {
        logger.info('[RECOVERY] Instagram API still down — staying degraded');
      }
    } catch (err) {
      logger.error('[RECOVERY] Timer error', { error: err.message });
    }
  }, RECOVERY_INTERVAL_MS);
}

// ─── Core ─────────────────────────────────────────────────────────────────────

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
  logger.info(`[APP MODE] switched to "${mode}"${reason ? ' — ' + reason : ''}`);
}

async function recordApiFailure(kind) {
  const now = Date.now();
  _failWindow.push(now);
  _failWindow = _failWindow.filter(t => now - t < FAIL_WINDOW_MS);
  if (_failWindow.length >= FAIL_THRESHOLD) {
    const current = await getMode();
    if (current.mode !== 'degraded') {
      // Confirm it's a real outage — probe from the server side
      const apiDown = !(await probeInstagramApi());
      const reason = apiDown
        ? `Auto: ${_failWindow.length} API failures in 5m + server probe failed (last: ${kind})`
        : `Auto: ${_failWindow.length} API failures in 5m — server probe OK (user-side issue?) (last: ${kind})`;

      await setMode('degraded', reason);
      _startRecoveryTimer();

      await _sendAlert(
        '🚨 InstaGrowth — API degraded, switching to honor mode',
        `Switched to HONOR (degraded) mode.\n\nReason: ${reason}\nTime: ${new Date().toISOString()}\n\nThe app will auto-probe Instagram API every 30 minutes and recover automatically when it comes back.`
      );
    }
  }
}

async function recordApiSuccess() {
  _failWindow = [];
}

// Called once on app boot — resumes recovery timer if server restarted while degraded
async function initOnBoot() {
  try {
    const current = await getMode();
    if (current.mode === 'degraded') {
      logger.info('[BOOT] App started in degraded mode — starting recovery timer');
      _startRecoveryTimer();
    }
  } catch (err) {
    logger.error('[BOOT] initOnBoot error', { error: err.message });
  }
}

module.exports = {
  getMode, getSettings, updateSettings, setMode,
  recordApiFailure, recordApiSuccess,
  probeInstagramApi, initOnBoot,
  DEFAULTS,
};
