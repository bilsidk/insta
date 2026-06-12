require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set');
  process.exit(1);
}

const app = require('./src/app');
const logger = require('./src/utils/logger');
const pool = require('./src/db/pool');
const { startAuditScheduler } = require('./src/services/auditScheduler');
const { runAdditiveMigration } = require('./src/migrate');

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, async () => {
  logger.info(`InstaGrowth API running on port ${PORT}`);
  // Apply idempotent additive migration on boot (creates task_starts + indexes
  // if missing). Non-fatal — never block serving if it fails.
  try {
    await runAdditiveMigration();
    logger.info('Additive migration applied on boot');
  } catch (err) {
    logger.error('Boot migration failed (continuing)', { error: err.message });
  }
  startAuditScheduler();
});

async function shutdown(signal) {
  logger.info(`${signal} received — shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
