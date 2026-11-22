'use strict';

module.exports = {
  up: async (db) => {
    await db.runSql(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT PRIMARY KEY,
        request_hash TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        response TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);

    await db.runSql(`
      CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at
        ON idempotency_keys (expires_at);
    `);
  },

  down: async (db) => {
    await db.runSql(`
      DROP INDEX IF EXISTS idx_idempotency_keys_expires_at;
    `);

    await db.runSql(`
      DROP TABLE IF EXISTS idempotency_keys;
    `);
  },
};