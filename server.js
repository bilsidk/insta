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
