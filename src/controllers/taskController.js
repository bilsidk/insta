const pool = require('../db/pool');
const cfg = require('../config');
const settings = require('../services/settingsService');
const antiCheat = require('../services/antiCheatService');
const instagram = require('../services/instagramService');
const logger = require('../utils/logger');

async function getAvailableTasks(req, res, next) {
  try {
    const { type } = req.query;
    const params = [req.userId];
    let typeFilter = '';
    if (type) { params.push(type); typeFilter = `AND t.task_type=$${params.length}`; }

    const r = await pool.query(
      `SELECT t.id, t.task_type, t.reward, t.remaining_slots, t.total_slots,
              t.instagram_media_id, t.instagram_media_thumbnail, t.instagram_media_permalink,
              t.instagram_media_caption, t.created_at,
              ia.username AS owner_username, ia.profile_pic_url AS owner_profile_pic,
              ia.role AS owner_role,
              CASE ia.role WHEN 'owner' THEN 1 WHEN 'premium' THEN 2 ELSE 3 END AS tier,
              CASE WHEN COALESCE(t.total_slots, t.remaining_slots) > 0
                   THEN (COALESCE(t.total_slots, t.remaining_slots) - t.remaining_slots)::float
                        / COALESCE(t.total_slots, t.remaining_slots)
                   ELSE 0 END AS progress_ratio
       FROM tasks t
       JOIN instagram_accounts ia ON ia.id = t.account_id
       LEFT JOIN completions co ON co.task_id = t.id AND co.user_id = $1
       WHERE t.status = 'active' AND t.remaining_slots > 0 AND t.user_id != $1
         AND co.id IS NULL ${typeFilter}
       ORDER BY tier ASC, progress_ratio ASC, t.created_at DESC LIMIT 80`,
      params
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

async function getMyTasks(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT t.*, ia.username, ia.profile_pic_url AS owner_avatar,
              (SELECT COUNT(*) FROM completions WHERE task_id = t.id) AS completions_count,
              CASE WHEN COALESCE(t.total_slots, t.remaining_slots) > 0
                   THEN ROUND(100.0 * (COALESCE(t.total_slots, t.remaining_slots) - t.remaining_slots)
                        / COALESCE(t.total_slots, t.remaining_slots))
                   ELSE 0 END AS progress_pct,
              (t.status = 'active') AS can_pause,
              (t.status = 'paused' AND t.remaining_slots > 0) AS can_resume,
              (t.status IN ('active', 'paused')) AS can_cancel
       FROM tasks t
       JOIN instagram_accounts ia ON ia.id = t.account_id
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC`,
      [req.userId]
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

async function createTask(req, res, next) {
  const client = await pool.connect();
  try {
    const { task_type, instagram_media_id, instagram_media_permalink,
            instagram_media_thumbnail, instagram_media_caption, followers_wanted } = req.body;
    const sanitize = (s) => s ? String(s).replace(/[<>]/g, '').slice(0, 2000) : null;
    const slots = parseInt(followers_wanted, 10);

    if (!slots || slots < 1) return res.status(400).json({ error: 'Slot count required' });
    if (!['follow', 'like', 'comment'].includes(task_type))
      return res.status(400).json({ error: 'Invalid task_type' });

    const acc = await client.query(
      'SELECT * FROM instagram_accounts WHERE id = $1',
      [req.userId]
    );
    if (!acc.rows.length)
      return res.status(400).json({ error: 'Connect Instagram account first' });

    const me = acc.rows[0];
    if (me.is_banned)
      return res.status(403).json({ error: me.ban_reason || 'Account suspended', code: 'BANNED' });

    const appSettings = await settings.getSettings();
    const margin = appSettings.house_margin ?? 3;
    const rewardMap = {
      follow:  appSettings.coins_follow,
      like:    appSettings.coins_like,
      comment: appSettings.coins_comment,
    };
    const taskReward = rewardMap[task_type];
    const slotCost   = taskReward + margin;

    const isOwner = me.role === 'owner';
    const totalCost = isOwner ? 0 : slots * slotCost;

    const MAX_SLOTS = isOwner ? 10000 : 1000;
    if (slots > MAX_SLOTS)
      return res.status(400).json({ error: `Maximum ${MAX_SLOTS} slots per campaign` });

    if (!isOwner) {
      const activeCount = await client.query(
        `SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND status IN ('active', 'paused')`,
        [req.userId]
      );
      if (parseInt(activeCount.rows[0].count, 10) >= appSettings.max_campaigns_per_user)
        return res.status(400).json({ error: `Maximum ${appSettings.max_campaigns_per_user} active campaigns allowed.` });
    }

    await client.query('BEGIN');

    if (!isOwner) {
      const uRes = await client.query('SELECT coins FROM instagram_accounts WHERE id = $1 FOR UPDATE', [req.userId]);
      if (uRes.rows[0].coins < totalCost) {
        await client.query('ROLLBACK');
        return res.status(402).json({ error: 'Insufficient coins', required: totalCost, available: uRes.rows[0].coins });
      }
      await client.query('UPDATE instagram_accounts SET coins = coins - $1 WHERE id = $2', [totalCost, req.userId]);
    }

    const ownerTier = isOwner ? cfg.TIER.OWNER
                    : me.role === 'premium' ? cfg.TIER.PREMIUM
                    : cfg.TIER.USER;

    const storedSlotCost = isOwner ? 0 : slotCost;

    const taskRes = await client.query(
      `INSERT INTO tasks (user_id, account_id, task_type,
          target_instagram_user_id, instagram_media_id, instagram_media_thumbnail,
          instagram_media_permalink, instagram_media_caption,
          reward, slot_cost, remaining_slots, total_slots, owner_tier)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12) RETURNING *`,
      [req.userId, req.userId, task_type,
       task_type === 'follow' ? me.instagram_user_id : null,
       sanitize(instagram_media_id), sanitize(instagram_media_thumbnail),
       sanitize(instagram_media_permalink), sanitize(instagram_media_caption),
       taskReward, storedSlotCost, slots, ownerTier]
    );

    const txKey = isOwner
      ? `tx:campaign_created|type:${task_type}|slots:${slots}|free:true`
      : `tx:campaign_created|type:${task_type}|slots:${slots}|cost:${slotCost}`;
    await client.query(
      `INSERT INTO transactions (user_id, amount, type, description) VALUES ($1, $2, 'spent', $3)`,
      [req.userId, totalCost, txKey]
    );

    await client.query('COMMIT');
    res.status(201).json({
      task: taskRes.rows[0],
      coins_spent: totalCost,
      slot_cost: slotCost,
      earner_reward: taskReward,
      owner: isOwner,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function verifyTask(req, res, next) {
  const dbc = await pool.connect();
  try {
    const taskId = parseInt(req.params.id, 10);
    const { started_at, device_id } = req.body;

    try {
      await antiCheat.assertNotBanned(req.userId);
      await antiCheat.assertVelocityOk(req.userId);
      if (device_id) await antiCheat.assertDeviceOk(req.userId, device_id);
    } catch (e) {
      return res.status(e.status || 403).json({ error: e.message, code: e.code });
    }

    const startedAt = Number(started_at);
    if (!started_at || !Number.isFinite(startedAt) || startedAt > Date.now() || startedAt < Date.now() - 86400000)
      return res.status(400).json({ error: 'Invalid started_at', code: 'INVALID_STARTED_AT' });

    const appSettings = await settings.getSettings();
    const delaySeconds = appSettings.completion_delay_seconds ?? 30;
    const elapsed = (Date.now() - startedAt) / 1000;
    if (elapsed < delaySeconds) {
      return res.status(400).json({
        error: `Wait ${Math.ceil(delaySeconds - elapsed)} more seconds`,
        remaining: Math.ceil(delaySeconds - elapsed),
        code: 'TOO_FAST',
      });
    }

    const taskRes = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (!taskRes.rows.length) return res.status(404).json({ error: 'Task not found' });
    const task = taskRes.rows[0];

    if (task.status === 'paused')
      return res.status(409).json({ error: 'Campaign is paused', code: 'CAMPAIGN_PAUSED' });
    if (task.status === 'cancelled')
      return res.status(409).json({ error: 'Campaign was cancelled', code: 'CAMPAIGN_CANCELLED' });
    if (task.status !== 'active' || task.remaining_slots <= 0)
      return res.status(409).json({ error: 'Campaign no longer available', code: 'CAMPAIGN_UNAVAILABLE' });
    if (task.user_id === req.userId)
      return res.status(403).json({ error: 'Cannot complete your own campaign' });

    const doerAcc = await pool.query(
      'SELECT instagram_user_id FROM instagram_accounts WHERE id = $1',
      [req.userId]
    );
    if (!doerAcc.rows.length)
      return res.status(400).json({ error: 'Connect Instagram first' });

    const mode = await settings.getMode();
    const degraded = mode.mode === 'degraded';
    let verifyMethod = 'honor';

    if (!degraded) {
      verifyMethod = 'api';
      try {
        let verified = false;
        if (task.task_type === 'follow')
          verified = await instagram.verifyFollow(task.user_id, doerAcc.rows[0].instagram_user_id);
        else if (task.task_type === 'like')
          verified = await instagram.verifyLike(task.user_id, task.instagram_media_id, doerAcc.rows[0].instagram_user_id);
        else if (task.task_type === 'comment')
          verified = await instagram.verifyComment(task.user_id, task.instagram_media_id, doerAcc.rows[0].instagram_user_id);
        await settings.recordApiSuccess();

        if (!verified)
          return res.status(400).json({ verified: false, error: 'Action not detected. Complete the task in Instagram then try again.' });
      } catch (err) {
        await settings.recordApiFailure(String(err.response?.status || 'other'));
        const after = await settings.getMode();
        if (after.mode === 'degraded') {
          verifyMethod = 'honor';
        } else {
          return res.status(502).json({ error: 'Could not verify right now. Try again shortly.', code: 'VERIFY_RETRY' });
        }
      }
    }

    await dbc.query('BEGIN');

    const lockRes = await dbc.query(
      `SELECT remaining_slots FROM tasks WHERE id = $1 AND status = 'active' AND remaining_slots > 0 FOR UPDATE`,
      [taskId]
    );
    if (!lockRes.rows.length) {
      await dbc.query('ROLLBACK');
      return res.status(409).json({ error: 'Someone just took the last slot — try another task!', code: 'CAMPAIGN_FULL' });
    }

    const dup = await dbc.query(
      'SELECT id FROM completions WHERE task_id = $1 AND user_id = $2',
      [taskId, req.userId]
    );
    if (dup.rows.length) {
      await dbc.query('ROLLBACK');
      return res.status(409).json({ error: 'Already completed this task' });
    }

    await dbc.query(
      `INSERT INTO completions (task_id, user_id, instagram_user_id, verify_method, verify_status, coins_awarded)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [taskId, req.userId, doerAcc.rows[0].instagram_user_id,
       verifyMethod, verifyMethod === 'api' ? 'verified' : 'pending', task.reward]
    );

    await dbc.query(
      `UPDATE tasks SET remaining_slots = remaining_slots - 1,
              status = CASE WHEN remaining_slots - 1 <= 0 THEN 'completed' ELSE status END
       WHERE id = $1`,
      [taskId]
    );

    await dbc.query('UPDATE instagram_accounts SET coins = coins + $1 WHERE id = $2', [task.reward, req.userId]);
    await dbc.query(
      `INSERT INTO transactions (user_id, amount, type, description) VALUES ($1, $2, 'earned', $3)`,
      [req.userId, task.reward, `tx:task_completed|type:${task.task_type}|method:${verifyMethod}`]
    );

    await dbc.query('COMMIT');

    await antiCheat.stampTask(req.userId);
    if (device_id) await antiCheat.registerDevice(req.userId, device_id);

    const bal = await pool.query('SELECT coins FROM instagram_accounts WHERE id = $1', [req.userId]);

    res.json({
      verified: true,
      method: verifyMethod,
      degraded,
      coins_earned: task.reward,
      new_balance: bal.rows[0].coins,
      message: verifyMethod === 'api'
        ? `✅ Verified! +${task.reward} coins`
        : degraded
          ? `⚠️ Verification offline — coins awarded, may be checked later.`
          : `Coins awarded. Task may be spot-checked.`,
    });
  } catch (err) {
    await dbc.query('ROLLBACK');
    next(err);
  } finally {
    dbc.release();
  }
}

async function getPricing(req, res, next) {
  try {
    const appSettings = await settings.getSettings();
    const margin = appSettings.house_margin ?? 3;
    res.json({
      follow:  { reward: appSettings.coins_follow,  slot_cost: appSettings.coins_follow  + margin },
      like:    { reward: appSettings.coins_like,    slot_cost: appSettings.coins_like    + margin },
      comment: { reward: appSettings.coins_comment, slot_cost: appSettings.coins_comment + margin },
      house_margin: margin,
      completion_delay_seconds: appSettings.completion_delay_seconds ?? 30,
    });
  } catch (err) { next(err); }
}

module.exports = { getAvailableTasks, getMyTasks, createTask, verifyTask, getPricing };
