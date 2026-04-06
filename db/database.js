const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'radiocalico.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS ratings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT    NOT NULL,
    song_key   TEXT    NOT NULL,
    rating     INTEGER NOT NULL CHECK(rating IN (1, -1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, song_key)
  )
`);

module.exports = db;
