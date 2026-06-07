const cron = require('node-cron');
const pool = require('../db/pool');
const instagram = require('./instagramService');
const antiCheat = require('./antiCheatService');
const logger = require('../utils/logger');

async function runAudit() {
  logger.info('Audit sweep started');

  const { rows } = await pool.query(
    `SELECT c.id, c.user_id, c.task_id, t.task_type, c.instagram_user_id,
            t.instagram_media_id, t.target_instagram_user_id,
            t.user_id AS owner_user_id
     FROM completions c
     JOIN tasks t ON t.id = c.task_id
     WHERE c.verified_at > NOW() - INTERVAL '2 days'
       AND c.verified_at < NOW() - INTERVAL '1 hour'
     ORDER BY RANDOM() LIMIT 20`
  );

  for (const comp of rows) {
    let stillValid = false;
    if (comp.task_type === 'follow') {
      stillValid = await instagram.verifyFollow(comp.owner_user_id, comp.instagram_user_id);
    } else if (comp.task_type === 'like') {
      stillValid = await instagram.verifyLike(comp.instagram_media_id, comp.instagram_user_id);
    } else if (comp.task_type === 'comment') {
      stillValid = await instagram.verifyComment(comp.instagram_media_id, comp.instagram_user_id);
    }

    if (!stillValid) {
      logger.warn('Audit reclaim triggered', { completionId: comp.id, userId: comp.user_id });
      const penalty = await antiCheat.penalizeReclaim(comp.user_id);
      await pool.query('DELETE FROM completions WHERE id = $1', [comp.id]);
      await pool.query(
        `UPDATE tasks SET remaining_slots = remaining_slots + 1 WHERE id = $1 AND status = 'active'`,
        [comp.task_id]
      );
      logger.warn('Audit reclaim executed', { userId: comp.user_id, banned: penalty.banned });
    }
  }

  logger.info('Audit sweep completed', { checked: rows.length });
}

function startAuditScheduler() {
  cron.schedule('*/30 * * * *', () => {
    runAudit().catch(err => logger.error('Audit cron error', { error: err.message }));
  });
  logger.info('Audit scheduler started (every 30 min)');
}

module.exports = { startAuditScheduler, runAudit };
