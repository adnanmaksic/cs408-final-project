const path = require('path');
const express = require('express');
const pages = require('./lib/pages');
const pagesRouter = require('./routes/pages');

const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.disable('x-powered-by');

// Available in every template (navbar, quick links, About page).
app.locals.appName = 'Grade Tracker';
app.locals.author = 'Ado Maksic';
app.locals.course = 'CS 408 Full Stack Web Development';
app.locals.githubUrl = 'https://github.com/adnanmaksic/cs408-final-project';
app.locals.pages = pages;

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

// Used by deploy scripts to confirm the server is up.
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.use('/', pagesRouter);

app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page not found',
    status: 404,
    message: "We couldn't find the page you were looking for.",
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: 'Something went wrong',
    status: 500,
    message: 'An unexpected error occurred. Please try again.',
  });
});

module.exports = app;
