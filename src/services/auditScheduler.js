const cron = require('node-cron');
const pool = require('../db/pool');
const instagram = require('./instagramService');
const antiCheat = require('./antiCheatService');
const settings = require('./settingsService');
const logger = require('../utils/logger');

const QUICK_DELAY_HOURS  = 2;
const DEEP_DELAY_HOURS   = 48;
const REAUDIT_EVERY_HOURS = 72;
const MAX_AUDITS  = 3;
const BATCH_SIZE  = 50;

async function checkValid(comp) {
  if (comp.task_type === 'follow')
    return instagram.verifyFollow(comp.owner_user_id, comp.instagram_user_id);
  if (comp.task_type === 'like')
    return instagram.verifyLike(comp.instagram_media_id, comp.instagram_user_id);
  if (comp.task_type === 'comment')
    return instagram.verifyComment(comp.instagram_media_id, comp.instagram_user_id);
  return true;
}

async function reclaim(comp) {
  const dbc = await pool.connect();
  try {
    await dbc.query('BEGIN');
    await dbc.query(
      `UPDATE completions SET verify_status = 'reclaimed', last_audit_at = NOW(), audit_count = audit_count + 1 WHERE id = $1`,
      [comp.id]
    );
    await dbc.query(
      'UPDATE instagram_accounts SET coins = GREATEST(0, coins - $1) WHERE id = $2',
      [comp.coins_awarded, comp.user_id]
    );
    await dbc.query(
      `INSERT INTO transactions (user_id, amount, type, description) VALUES ($1, $2, 'spent', $3)`,
      [comp.user_id, comp.coins_awarded, `tx:coins_reclaimed|type:${comp.task_type}`]
    );
    // Restore the slot and reactivate completed tasks so the campaign owner gets what they paid for
    await dbc.query(
      `UPDATE tasks SET remaining_slots = remaining_slots + 1,
              status = CASE WHEN status = 'completed' THEN 'active' ELSE status END
       WHERE id = $1`,
      [comp.task_id]
    );
    await dbc.query('COMMIT');
  } catch (e) {
    await dbc.query('ROLLBACK');
    logger.error('Audit reclaim failed', { completionId: comp.id, error: e.message });
  } finally {
    dbc.release();
  }
  await antiCheat.penalizeReclaim(comp.user_id);
}

async function runPass(quick) {
  const delay = quick ? QUICK_DELAY_HOURS : DEEP_DELAY_HOURS;
  const due = await pool.query(
    `SELECT c.id, c.user_id, c.instagram_user_id, c.coins_awarded, c.audit_count,
            t.task_type, t.instagram_media_id,
            t.user_id AS owner_user_id
     FROM completions c
     JOIN tasks t ON t.id = c.task_id
     WHERE c.verify_method = 'api' AND c.verify_status = 'verified'
       AND c.audit_count < $1
       AND ($2 = TRUE OR c.audit_count > 0)
       AND c.completed_at < NOW() - ($3 || ' hours')::interval
       AND (c.last_audit_at IS NULL OR c.last_audit_at < NOW() - ($4 || ' hours')::interval)
     ORDER BY c.completed_at ASC LIMIT $5`,
    [MAX_AUDITS, quick, delay, REAUDIT_EVERY_HOURS, BATCH_SIZE]
  );

  let checked = 0, reclaimed = 0;
  for (const comp of due.rows) {
    checked++;
    let valid = true;
    try {
      valid = await checkValid(comp);
      await settings.recordApiSuccess();
    } catch (e) {
      await settings.recordApiFailure('audit');
      await pool.query(
        'UPDATE completions SET last_audit_at = NOW(), audit_count = audit_count + 1 WHERE id = $1',
        [comp.id]
      );
      continue;
    }
    if (valid) {
      await pool.query(
        'UPDATE completions SET last_audit_at = NOW(), audit_count = audit_count + 1 WHERE id = $1',
        [comp.id]
      );
    } else {
      reclaimed++;
      await reclaim(comp);
    }
  }
  return { checked, reclaimed };
}

async function runAudit() {
  const mode = await settings.getMode();
  if (mode.mode === 'degraded') {
    logger.info('Audit skipped — degraded mode');
    return { skipped: true };
  }

  logger.info('Audit sweep started');
  try {
    const quick = await runPass(true);
    const deep  = await runPass(false);
    logger.info('Audit sweep completed', { quick, deep });
    return { quick, deep };
  } catch (err) {
    logger.error('Audit sweep error', { error: err.message });
    return { error: err.message };
  }
}

function startAuditScheduler() {
  cron.schedule('*/30 * * * *', () => {
    runAudit().catch(err => logger.error('Audit cron error', { error: err.message }));
  });
  logger.info('Audit scheduler started (every 30 min)');
}

module.exports = { startAuditScheduler, runAudit };
