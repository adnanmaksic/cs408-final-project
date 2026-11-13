const crypto = require('crypto');
const path = require('path');
const express = require('express');
const session = require('express-session');
const pages = require('./lib/pages');
const { getDb } = require('./lib/db');
const { migrate } = require('./db/migrate');
const SqliteSessionStore = require('./lib/session-store');
const { loadUser, flash } = require('./lib/auth');
const authRouter = require('./routes/auth');
const coursesRouter = require('./routes/courses');
const assignmentsRouter = require('./routes/assignments');
const { STATUSES, isOverdue } = require('./lib/assignments');
const { formatDue } = require('./lib/dates');
const pagesRouter = require('./routes/pages');

const db = getDb();
migrate(db); // make sure the schema is current before handling requests

const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.set('trust proxy', 1); // behind nginx on EC2
app.disable('x-powered-by');

// Available in every template (navbar, quick links, About page).
app.locals.appName = 'Grade Tracker';
app.locals.author = 'Ado Maksic';
app.locals.course = 'CS 408 Full Stack Web Development';
app.locals.githubUrl = 'https://github.com/adnanmaksic/cs408-final-project';
app.locals.pages = pages;
app.locals.assignmentStatuses = STATUSES;
app.locals.isOverdue = isOverdue;
app.locals.formatDue = formatDue;
app.locals.grades = require('./lib/grades');

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  // Fine for local development; on EC2, scripts/configure.sh puts one in .env.
  sessionSecret = crypto.randomBytes(32).toString('hex');
  if (process.env.NODE_ENV !== 'test') {
    console.warn('SESSION_SECRET is not set; using a random one (logins reset when the app restarts).');
  }
}

app.use(express.static(path.join(__dirname, 'public')));
// The grade math runs in the browser too (Grade Calculator), from the same file.
app.get('/js/grades.js', (req, res) => res.sendFile(path.join(__dirname, 'lib', 'grades.js')));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: 'gt.sid',
  secret: sessionSecret,
  store: new SqliteSessionStore(db),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 },
}));
app.use(loadUser);
app.use(flash);

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

// Used by deploy scripts to confirm the server is up.
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.use('/', authRouter);
app.use('/', coursesRouter);
app.use('/', assignmentsRouter);
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
