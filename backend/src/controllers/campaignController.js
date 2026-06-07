const pool = require('../db/pool');
const cfg = require('../config');

async function assertOwnsTask(taskId, userId) {
  const r = await pool.query(
    `SELECT t.*, u.email, u.role
     FROM tasks t JOIN users u ON u.id = $2
     WHERE t.id = $1 AND t.user_id = $2`,
    [taskId, userId]
  );
  return r.rows[0] || null;
}

async function pauseCampaign(req, res, next) {
  try {
    const taskId = parseInt(req.params.id, 10);
    const task = await assertOwnsTask(taskId, req.userId);
    if (!task) return res.status(403).json({ error: 'Campaign not found or not yours' });
    if (task.status !== 'active') return res.status(400).json({ error: `Campaign is ${task.status}` });
    await pool.query("UPDATE tasks SET status = 'paused' WHERE id = $1", [taskId]);
    res.json({ ok: true, message: 'Campaign paused.', status: 'paused', remaining_slots: task.remaining_slots });
  } catch (err) { next(err); }
}

async function resumeCampaign(req, res, next) {
  try {
    const taskId = parseInt(req.params.id, 10);
    const task = await assertOwnsTask(taskId, req.userId);
    if (!task) return res.status(403).json({ error: 'Campaign not found or not yours' });
    if (task.status !== 'paused') return res.status(400).json({ error: `Campaign is ${task.status}` });
    if (task.remaining_slots <= 0) return res.status(400).json({ error: 'No slots remaining' });
    await pool.query("UPDATE tasks SET status = 'active' WHERE id = $1", [taskId]);
    res.json({ ok: true, message: 'Campaign resumed.', status: 'active', remaining_slots: task.remaining_slots });
  } catch (err) { next(err); }
}

async function cancelCampaign(req, res, next) {
  const client = await pool.connect();
  try {
    const taskId = parseInt(req.params.id, 10);
    const task = await assertOwnsTask(taskId, req.userId);
    if (!task) return res.status(403).json({ error: 'Campaign not found or not yours' });
    if (['cancelled', 'completed'].includes(task.status))
      return res.status(400).json({ error: `Campaign is already ${task.status}` });

    const isAppOwner = task.role === 'owner' || task.email?.toLowerCase() === cfg.OWNER_EMAIL;
    let slotRefund = cfg.INSTA_SLOT_COSTS[task.task_type] || 0;
    const refundCoins = isAppOwner ? 0 : task.remaining_slots * slotRefund;

    await client.query('BEGIN');
    await client.query("UPDATE tasks SET status = 'cancelled' WHERE id = $1", [taskId]);
    if (refundCoins > 0) {
      await client.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [refundCoins, req.userId]);
      await client.query(
        `INSERT INTO transactions (user_id, amount, type, description) VALUES ($1, $2, 'earned', $3)`,
        [req.userId, refundCoins, `Refund — campaign #${taskId} cancelled (${task.remaining_slots} slots)`]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, refunded_coins: refundCoins, remaining_slots: task.remaining_slots });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { pauseCampaign, resumeCampaign, cancelCampaign };
