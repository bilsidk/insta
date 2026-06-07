require('dotenv').config();

const app = require('./app');
const logger = require('./utils/logger');
const { startAuditScheduler } = require('./services/auditScheduler');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  logger.info(`InstaGrowth API running on port ${PORT}`);
  startAuditScheduler();
});
