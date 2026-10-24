// Applies every db/migrations/*.sql file that hasn't run yet, in name order.
// Safe to run again: applied migrations are recorded in schema_migrations.
//   npm run db:migrate
const fs = require('fs');
const path = require('path');
const { getDb } = require('../lib/db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function migrate(db = getDb(), { log = () => {} } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);

  const applied = new Set(db.prepare('SELECT name FROM schema_migrations').pluck().all());
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const pending = files.filter((f) => !applied.has(f));

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
    })();
    log(`applied ${file}`);
  }
  return pending;
}

if (require.main === module) {
  const done = migrate(getDb(), { log: (msg) => console.log(`    ${msg}`) });
  console.log(done.length ? `Database migrated (${done.length} new).` : 'Database is up to date.');
}

module.exports = { migrate };
