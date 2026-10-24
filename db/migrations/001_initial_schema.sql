-- Initial schema: a user has many courses, a course has many grading
-- categories, and a category has many assignments. Deleting a parent row
-- removes its children (ON DELETE CASCADE).

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  display_name  TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE courses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code         TEXT    NOT NULL,
  name         TEXT    NOT NULL,
  instructor   TEXT,
  term         TEXT    NOT NULL,
  color        TEXT    NOT NULL DEFAULT '#0d6efd',
  target_grade REAL    NOT NULL DEFAULT 90 CHECK (target_grade BETWEEN 0 AND 100),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE categories (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name      TEXT    NOT NULL,
  weight    REAL    NOT NULL CHECK (weight > 0 AND weight <= 100)
);

CREATE TABLE assignments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  category_id     INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  title           TEXT    NOT NULL,
  description     TEXT,
  due_date        TEXT    NOT NULL,
  points_possible REAL    NOT NULL CHECK (points_possible > 0),
  points_earned   REAL    CHECK (points_earned IS NULL OR points_earned >= 0),
  status          TEXT    NOT NULL DEFAULT 'not_started'
                  CHECK (status IN ('not_started', 'in_progress', 'submitted', 'graded')),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_courses_user ON courses(user_id);
CREATE INDEX idx_categories_course ON categories(course_id);
CREATE INDEX idx_assignments_user_due ON assignments(user_id, due_date);
CREATE INDEX idx_assignments_course ON assignments(course_id);

-- Login sessions (used by lib/session-store.js).
CREATE TABLE sessions (
  sid     TEXT    PRIMARY KEY,
  sess    TEXT    NOT NULL,
  expires INTEGER NOT NULL
);

CREATE INDEX idx_sessions_expires ON sessions(expires);
