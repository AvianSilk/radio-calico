const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://radiocalico:radiocalico@localhost:5432/radiocalico',
});

pool.query(`
  CREATE TABLE IF NOT EXISTS ratings (
    id         SERIAL PRIMARY KEY,
    user_id    TEXT        NOT NULL,
    song_key   TEXT        NOT NULL,
    rating     INTEGER     NOT NULL CHECK(rating IN (1, -1)),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, song_key)
  )
`).catch(err => {
  console.error('Database init error:', err.message);
  process.exit(1);
});

module.exports = pool;
