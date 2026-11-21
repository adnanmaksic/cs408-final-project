const express = require('express');
const { requireLogin } = require('../lib/auth');
const courses = require('../lib/courses');
const assignments = require('../lib/assignments');
const { toWallClock } = require('../lib/dates');

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

// Dashboard: unfinished work due in the next 7 days, overdue work, and a grade
// card for each course in the most recent term. Everything is the user's own.
router.get('/dashboard', requireLogin, (req, res) => {
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [from, until] = [toWallClock(now), toWallClock(weekAhead)];
  const term = courses.listTerms(req.user.id)[0] || null;
  const gradeCards = term
    ? courses.listCourses(req.user.id, term).map((c) => ({ ...c, grade: courses.gradeSummary(req.user.id, c) }))
    : [];
  res.render('dashboard', {
    title: 'Dashboard',
    today: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    dueSoon: assignments.listDueBetween(req.user.id, from, until),
    overdue: assignments.listOverdue(req.user.id, from),
    term,
    gradeCards,
    hasCourses: Boolean(term),
  });
});

module.exports = router;
