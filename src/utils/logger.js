const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const level = levels[process.env.LOG_LEVEL] ?? levels.info;

function log(lvl, msg, data) {
  if (levels[lvl] > level) return;
  const entry = { t: new Date().toISOString(), lvl, msg };
  if (data) entry.data = typeof data === 'object' ? data : String(data);
  if (lvl === 'error') process.stderr.write(JSON.stringify(entry) + '\n');
  else process.stdout.write(JSON.stringify(entry) + '\n');
}

module.exports = {
  error: (msg, d) => log('error', msg, d),
  warn:  (msg, d) => log('warn',  msg, d),
  info:  (msg, d) => log('info',  msg, d),
  debug: (msg, d) => log('debug', msg, d),
};
