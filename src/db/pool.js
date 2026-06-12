const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const isProd = process.env.NODE_ENV === 'production';

// Use SSL for Neon and Railway (production) — allow self-signed certs common on PaaS
const sslConfig = isProd || (DATABASE_URL && DATABASE_URL.includes('neon.tech'))
  ? { rejectUnauthorized: process.env.DB_SSL_NO_VERIFY !== 'true' }
  : false;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: sslConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected pool error:', err);
});

module.exports = pool;
