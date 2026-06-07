require('dotenv').config();

const app = require('./src/app');
const logger = require('./src/utils/logger');
const { startAuditScheduler } = require('./src/services/auditScheduler');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  logger.info(`InstaGrowth API running on port ${PORT}`);
  startAuditScheduler();
});
