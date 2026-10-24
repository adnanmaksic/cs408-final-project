const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_PATH = path.join(__dirname, '..', 'data', 'grade-tracker.db');

let db;

// Opens the database once and reuses it. DB_PATH=':memory:' is used by tests.
function getDb() {
  if (!db) {
    const file = process.env.DB_PATH || DEFAULT_PATH;
    if (file !== ':memory:') {
      fs.mkdirSync(path.dirname(file), { recursive: true });
    }
    db = new Database(file);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

module.exports = { getDb };
