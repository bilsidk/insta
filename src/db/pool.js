const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const isNeon = DATABASE_URL && DATABASE_URL.includes('neon.tech');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isNeon ? { rejectUnauthorized: false } : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected pool error:', err);
});

module.exports = pool;
