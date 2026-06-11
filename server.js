require('dotenv').config();

const app = require('./src/app');
const logger = require('./src/utils/logger');
const pool = require('./src/db/pool');
const { startAuditScheduler } = require('./src/services/auditScheduler');

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  logger.info(`InstaGrowth API running on port ${PORT}`);
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
