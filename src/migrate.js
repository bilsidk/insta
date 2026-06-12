require('dotenv').config();
const pool = require('./db/pool');

const SCHEMA = `
-- Drop old schema (safe: DB was wiped)
DROP TABLE IF EXISTS completions CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS device_accounts CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS instagram_accounts CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS app_settings CASCADE;
DROP TABLE IF EXISTS account_history CASCADE;

CREATE TABLE IF NOT EXISTS account_history (
  instagram_user_id VARCHAR(255) PRIMARY KEY,
  bonus_granted     BOOLEAN DEFAULT FALSE,
  was_banned        BOOLEAN DEFAULT FALSE,
  ban_reason        TEXT,
  updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instagram_accounts (
  id SERIAL PRIMARY KEY,
  instagram_user_id VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(255) NOT NULL,
  account_type VARCHAR(50),
  profile_pic_url TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expiry TIMESTAMP,
  coins INTEGER DEFAULT 0,
  role VARCHAR(20) DEFAULT 'user',
  is_premium BOOLEAN DEFAULT FALSE,
  is_banned BOOLEAN DEFAULT FALSE,
  ban_reason TEXT,
  last_task_at TIMESTAMP,
  device_id VARCHAR(255),
  reclaim_count INTEGER DEFAULT 0,
  trust_score INTEGER DEFAULT 100,
  banned_at TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  task_type VARCHAR(50) NOT NULL,
  target_instagram_user_id VARCHAR(255),
  instagram_media_id VARCHAR(255),
  instagram_media_thumbnail TEXT,
  instagram_media_permalink TEXT,
  instagram_media_caption TEXT,
  reward INTEGER NOT NULL,
  slot_cost INTEGER NOT NULL DEFAULT 0,
  remaining_slots INTEGER NOT NULL,
  total_slots INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  owner_tier INTEGER DEFAULT 3,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS completions (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  instagram_user_id VARCHAR(255),
  verify_method VARCHAR(20) DEFAULT 'api',
  verify_status VARCHAR(20) DEFAULT 'verified',
  coins_awarded INTEGER DEFAULT 0,
  last_audit_at TIMESTAMP,
  audit_count INTEGER DEFAULT 0,
  verified_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(task_id, user_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_accounts (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(255) NOT NULL,
  user_id INTEGER REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  UNIQUE(device_id, user_id)
);

CREATE TABLE IF NOT EXISTS task_starts (
  task_id        INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  user_id        INTEGER REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  baseline_count INTEGER,
  started_at     TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  api_mode VARCHAR(20) DEFAULT 'live',
  degraded_reason TEXT,
  settings JSONB DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO app_settings (id, api_mode, settings)
VALUES (1, 'live', '{}')
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_completions_task ON completions(task_id);
CREATE INDEX IF NOT EXISTS idx_completions_user ON completions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_ig_user ON instagram_accounts(instagram_user_id);
CREATE INDEX IF NOT EXISTS idx_device_accounts_device ON device_accounts(device_id);
CREATE INDEX IF NOT EXISTS idx_task_starts_user ON task_starts(user_id);
CREATE INDEX IF NOT EXISTS idx_completions_task_verified ON completions(task_id, verified_at);
`;

// Non-destructive migration for existing deployments
const ADDITIVE = `
CREATE TABLE IF NOT EXISTS account_history (
  instagram_user_id VARCHAR(255) PRIMARY KEY,
  bonus_granted     BOOLEAN DEFAULT FALSE,
  was_banned        BOOLEAN DEFAULT FALSE,
  ban_reason        TEXT,
  updated_at        TIMESTAMP DEFAULT NOW()
);

ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS task_starts (
  task_id        INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  user_id        INTEGER REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  baseline_count INTEGER,
  started_at     TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_starts_user ON task_starts(user_id);
-- verifyTask counts api completions since a timestamp on the hot path
CREATE INDEX IF NOT EXISTS idx_completions_task_verified ON completions(task_id, verified_at);
`;

// Idempotent additive migration — safe to call on every server boot.
async function runAdditiveMigration() {
  await pool.query(ADDITIVE);
}

async function migrate() {
  try {
    // Apply additive changes first (safe on existing DB)
    await runAdditiveMigration();
    console.log('[Migrate] Additive migration applied');
    // Full schema only if explicitly requested
    if (process.argv.includes('--full')) {
      await pool.query(SCHEMA);
      console.log('[Migrate] Full schema applied');
    }
    process.exit(0);
  } catch (err) {
    console.error('[Migrate] Error:', err.message);
    process.exit(1);
  }
}

module.exports = { runAdditiveMigration };

// Only run the CLI flow when executed directly (node src/migrate.js),
// not when required by the server for boot-time migration.
if (require.main === module) migrate();
