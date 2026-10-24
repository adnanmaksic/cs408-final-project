const session = require('express-session');

const ONE_DAY = 24 * 60 * 60 * 1000;

// express-session store that keeps sessions in the SQLite `sessions` table,
// so logins survive app restarts and server reboots.
class SqliteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.getStmt = db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expires > ?');
    this.setStmt = db.prepare(`INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires`);
    this.touchStmt = db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?');
    this.destroyStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.pruneStmt = db.prepare('DELETE FROM sessions WHERE expires <= ?');

    this.pruneTimer = setInterval(() => this.pruneStmt.run(Date.now()), 15 * 60 * 1000);
    this.pruneTimer.unref();
  }

  static expiresAt(sess) {
    const expires = sess && sess.cookie && sess.cookie.expires;
    return expires ? new Date(expires).getTime() : Date.now() + ONE_DAY;
  }

  get(sid, cb) {
    try {
      const row = this.getStmt.get(sid, Date.now());
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sess, cb = () => {}) {
    try {
      this.setStmt.run(sid, JSON.stringify(sess), SqliteSessionStore.expiresAt(sess));
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  touch(sid, sess, cb = () => {}) {
    try {
      this.touchStmt.run(SqliteSessionStore.expiresAt(sess), sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  destroy(sid, cb = () => {}) {
    try {
      this.destroyStmt.run(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
}

module.exports = SqliteSessionStore;
