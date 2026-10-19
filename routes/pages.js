const express = require('express');
const pages = require('../lib/pages');

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

// Placeholders for pages that later checkpoints will build.
for (const page of pages.filter((p) => p.checkpoint)) {
  router.get(page.path, (req, res) => {
    res.render('coming-soon', { title: page.title, page });
  });
}

module.exports = router;
