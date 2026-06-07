const logger = require('../utils/logger');

function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const msg = err.code === 'BANNED' ? err.message
    : err.code === 'TOO_FAST' ? err.message
    : status >= 500 ? 'Internal server error'
    : err.message || 'Unknown error';

  if (status >= 500) logger.error('Unhandled error', { path: req.path, error: err.message, stack: err.stack });
  else logger.warn('Request error', { path: req.path, status, message: err.message });

  res.status(status).json({ error: msg, code: err.code || undefined });
}

module.exports = { errorHandler };
