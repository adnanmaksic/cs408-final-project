// Adds a demo account with sample courses, categories and assignments.
// Safe to run again: does nothing if the demo account already exists.
//   npm run db:seed
const bcrypt = require('bcrypt');
const { getDb } = require('../lib/db');
const { migrate } = require('./migrate');

const DEMO_EMAIL = 'demo@gradetracker.test';
const DEMO_PASSWORD = 'demo-password';

// ISO date `days` from now at the given hour, so the demo always has upcoming work.
function daysFromNow(days, hour = 23, minute = 59) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

const COURSES = [
  {
    code: 'CS 408', name: 'Full Stack Web Development', instructor: 'Dr. Rivera',
    color: '#0d6efd', target: 93,
    categories: [
      { name: 'Homework', weight: 30, items: [
        { title: 'Express routing exercise', due: -12, possible: 20, earned: 19, status: 'graded' },
        { title: 'Pug templates exercise', due: -5, possible: 20, earned: 17, status: 'graded' },
        { title: 'SQLite queries exercise', due: 2, possible: 20, status: 'in_progress' },
      ] },
      { name: 'Project checkpoints', weight: 50, items: [
        { title: 'Checkpoint 1: deployed skeleton', due: -8, possible: 30, earned: 28, status: 'graded' },
        { title: 'Checkpoint 2: database and accounts', due: 4, possible: 30, status: 'in_progress' },
      ] },
      { name: 'Final exam', weight: 20, items: [
        { title: 'Final exam', due: 45, possible: 100, status: 'not_started' },
      ] },
    ],
  },
  {
    code: 'MATH 301', name: 'Linear Algebra', instructor: 'Prof. Chen',
    color: '#198754', target: 90,
    categories: [
      { name: 'Quizzes', weight: 25, items: [
        { title: 'Quiz 3: eigenvalues', due: -3, possible: 10, earned: 8, status: 'graded' },
        { title: 'Quiz 4: diagonalization', due: 6, possible: 10, status: 'not_started' },
      ] },
      { name: 'Exams', weight: 75, items: [
        { title: 'Midterm 1', due: -14, possible: 100, earned: 84, status: 'graded' },
        { title: 'Midterm 2', due: 1, possible: 100, status: 'not_started' },
      ] },
    ],
  },
];

function seed(db = getDb()) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_EMAIL);
  if (existing) return false;

  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 12);
  const insertUser = db.prepare(
    'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)'
  );
  const insertCourse = db.prepare(`INSERT INTO courses
    (user_id, code, name, instructor, term, color, target_grade) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insertCategory = db.prepare(
    'INSERT INTO categories (course_id, name, weight) VALUES (?, ?, ?)'
  );
  const insertAssignment = db.prepare(`INSERT INTO assignments
    (user_id, course_id, category_id, title, due_date, points_possible, points_earned, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  db.transaction(() => {
    const userId = insertUser.run(DEMO_EMAIL, passwordHash, 'Demo Student').lastInsertRowid;
    for (const c of COURSES) {
      const courseId = insertCourse.run(
        userId, c.code, c.name, c.instructor, 'Fall 2026', c.color, c.target
      ).lastInsertRowid;
      for (const cat of c.categories) {
        const categoryId = insertCategory.run(courseId, cat.name, cat.weight).lastInsertRowid;
        for (const a of cat.items) {
          insertAssignment.run(
            userId, courseId, categoryId, a.title, daysFromNow(a.due),
            a.possible, a.earned ?? null, a.status
          );
        }
      }
    }
  })();
  return true;
}

if (require.main === module) {
  const db = getDb();
  migrate(db);
  console.log(seed(db)
    ? `Seeded demo account ${DEMO_EMAIL} (password: ${DEMO_PASSWORD}).`
    : 'Demo account already exists; nothing to seed.');
}

module.exports = { seed, DEMO_EMAIL, DEMO_PASSWORD };
