const express = require('express');
const pages = require('../lib/pages');
const { getDb } = require('../lib/db');
const { requireLogin } = require('../lib/auth');

const router = express.Router();

const features = [
  {
    icon: 'calendar-week',
    title: 'Due dates',
    text: "See everything due in the next 7 days across all your classes, with overdue work flagged in red.",
  },
  {
    icon: 'graph-up-arrow',
    title: 'Live grades',
    text: "Enter each syllabus's grading weights once and get a weighted grade for every course as scores come in.",
  },
  {
    icon: 'calculator',
    title: 'What-if calculator',
    text: 'Set a target grade and find out the average you need on the remaining work to reach it.',
  },
];

router.get('/', (req, res) => {
  res.render('index', { title: null, features });
});

router.get('/about', (req, res) => {
  res.render('about', { title: 'About & Help' });
});

// Dashboard (Checkpoint 2 version): greets the user and summarizes their data.
// The full due-this-week list and grade cards arrive in Checkpoint 6.
router.get('/dashboard', requireLogin, (req, res) => {
  const db = getDb();
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const stats = {
    courses: db.prepare('SELECT COUNT(*) FROM courses WHERE user_id = ?').pluck().get(req.user.id),
    assignments: db.prepare('SELECT COUNT(*) FROM assignments WHERE user_id = ?').pluck().get(req.user.id),
    dueThisWeek: db.prepare(`SELECT COUNT(*) FROM assignments
      WHERE user_id = ? AND status NOT IN ('submitted', 'graded') AND due_date BETWEEN ? AND ?`)
      .pluck().get(req.user.id, now.toISOString(), weekAhead.toISOString()),
  };
  res.render('dashboard', { title: 'Dashboard', stats });
});

// Placeholders for pages that later checkpoints will build. Most need a login.
for (const page of pages.filter((p) => p.checkpoint)) {
  const guards = page.auth ? [requireLogin] : [];
  router.get(page.path, ...guards, (req, res) => {
    res.render('coming-soon', { title: page.title, page });
  });
}

module.exports = router;
