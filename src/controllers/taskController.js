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
              ia.username AS owner_username, ia.profile_pic_url AS owner_profile_pic
       FROM tasks t
       JOIN instagram_accounts ia ON ia.id = t.account_id
       LEFT JOIN completions co ON co.task_id = t.id AND co.user_id = $1
       WHERE t.status = 'active' AND t.remaining_slots > 0 AND t.user_id != $1 AND co.id IS NULL ${typeFilter}
       ORDER BY t.created_at DESC LIMIT 50`,
      params
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

async function getMyTasks(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT t.*, ia.username, ia.profile_pic_url AS owner_avatar,
              (SELECT COUNT(*) FROM completions WHERE task_id = t.id) AS completions_count
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
    const { task_type, instagram_media_id, instagram_media_permalink, instagram_media_thumbnail, instagram_media_caption, followers_wanted } = req.body;
    const slots = parseInt(followers_wanted, 10);

    if (!slots || slots < 1) return res.status(400).json({ error: 'Slot count required' });
    if (!cfg.INSTA_REWARDS[task_type]) return res.status(400).json({ error: 'Invalid task_type' });

    const acc = await client.query(
      'SELECT * FROM instagram_accounts WHERE user_id = $1 AND is_active = TRUE LIMIT 1',
      [req.userId]
    );
    if (!acc.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Connect Instagram account first' });
    }

    const isOwner = false;
    const slotCost = cfg.INSTA_SLOT_COSTS[task_type];
    const taskReward = cfg.INSTA_REWARDS[task_type];
    const totalCost = slots * slotCost;

    const me = await client.query('SELECT role, email, coins FROM users WHERE id = $1', [req.userId]);
    const user = me.rows[0];

    const uRes = await client.query('SELECT coins FROM users WHERE id = $1 FOR UPDATE', [req.userId]);
    if (uRes.rows[0].coins < totalCost) {
      await client.query('ROLLBACK');
      return res.status(402).json({ error: 'Insufficient coins', required: totalCost, available: uRes.rows[0].coins });
    }

    await client.query('BEGIN');
    await client.query('UPDATE users SET coins = coins - $1 WHERE id = $2', [totalCost, req.userId]);

    const taskRes = await client.query(
      `INSERT INTO tasks (user_id, account_id, task_type,
          target_instagram_user_id, instagram_media_id, instagram_media_thumbnail,
          instagram_media_permalink, instagram_media_caption,
          reward, remaining_slots, total_slots, owner_tier)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11) RETURNING *`,
      [req.userId, acc.rows[0].id, task_type,
       task_type === 'follow' ? acc.rows[0].instagram_user_id : null,
       instagram_media_id || null, instagram_media_thumbnail || null,
       instagram_media_permalink || null, instagram_media_caption || null,
       taskReward, slots, cfg.TIER.USER]
    );

    const txKey = `tx:campaign_created|type:${task_type}|slots:${slots}|cost:${slotCost}`;
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
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function verifyTask(req, res, next) {
  try {
    const taskId = parseInt(req.params.id, 10);
    const task = await pool.query('SELECT * FROM tasks WHERE id = $1 AND status = \'active\' AND remaining_slots > 0', [taskId]);
    if (!task.rows.length) return res.status(404).json({ error: 'Task not found or completed' });

    await antiCheat.assertNotBanned(req.userId);
    await antiCheat.assertVelocityOk(req.userId);

    const doerAcc = await pool.query(
      'SELECT instagram_user_id FROM instagram_accounts WHERE user_id = $1 AND is_active = TRUE',
      [req.userId]
    );
    if (!doerAcc.rows.length) return res.status(400).json({ error: 'Connect Instagram first' });

    const existing = await pool.query(
      'SELECT id FROM completions WHERE task_id = $1 AND user_id = $2',
      [taskId, req.userId]
    );
    if (existing.rows.length) return res.status(400).json({ error: 'Already completed this task' });

    const t = task.rows[0];
    let verified = false;

    if (t.task_type === 'follow') {
      verified = await instagram.verifyFollow(t.user_id, doerAcc.rows[0].instagram_user_id);
    } else if (t.task_type === 'like') {
      verified = await instagram.verifyLike(t.instagram_media_id, doerAcc.rows[0].instagram_user_id);
    } else if (t.task_type === 'comment') {
      verified = await instagram.verifyComment(t.instagram_media_id, doerAcc.rows[0].instagram_user_id);
    }

    if (!verified) return res.status(400).json({ error: 'Action not detected. Ensure you followed/liked/commented and try again.' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO completions (task_id, user_id, instagram_user_id) VALUES ($1, $2, $3)`,
        [taskId, req.userId, doerAcc.rows[0].instagram_user_id]
      );
      await client.query(
        'UPDATE tasks SET remaining_slots = remaining_slots - 1 WHERE id = $1',
        [taskId]
      );
      await client.query(
        'UPDATE users SET coins = coins + $1 WHERE id = $2',
        [t.reward, req.userId]
      );
      await client.query(
        `INSERT INTO transactions (user_id, amount, type, description) VALUES ($1, $2, 'earned', $3)`,
        [req.userId, t.reward, `tx:task_completed|id:${taskId}|type:${t.task_type}`]
      );

      const remaining = await client.query('SELECT remaining_slots FROM tasks WHERE id = $1', [taskId]);
      if (remaining.rows[0].remaining_slots <= 0) {
        await client.query("UPDATE tasks SET status = 'completed' WHERE id = $1", [taskId]);
      }

      await client.query('COMMIT');
      await antiCheat.stampTask(req.userId);
      res.json({ ok: true, reward: t.reward, remaining: remaining.rows[0].remaining_slots });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
}

module.exports = { getAvailableTasks, getMyTasks, createTask, verifyTask };
