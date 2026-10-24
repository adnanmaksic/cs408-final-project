const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../lib/db');
const { redirectIfLoggedIn, safeRedirectPath } = require('../lib/auth');

const router = express.Router();

const BCRYPT_ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 12;
const MIN_PASSWORD = 8;

// Field name -> first error message, for showing next to each input.
function errorMap(req) {
  return validationResult(req).mapped();
}

function renderAuth(res, mode, { status = 200, loginErrors = {}, registerErrors = {}, values = {}, next } = {}) {
  res.status(status).render('auth', {
    title: mode === 'login' ? 'Log In' : 'Register',
    mode,
    loginErrors,
    registerErrors,
    values,
    next: next ? safeRedirectPath(next) : '',
  });
}

// Starts a fresh session for the user (prevents session fixation).
function logIn(req, res, userId, redirectTo, message) {
  req.session.regenerate((err) => {
    if (err) return res.status(500).render('error', { title: 'Something went wrong', status: 500, message: 'Could not log you in. Please try again.' });
    req.session.userId = userId;
    req.session.flash = { type: 'success', message };
    req.session.save(() => res.redirect(redirectTo));
  });
}

router.get('/login', redirectIfLoggedIn, (req, res) => {
  renderAuth(res, 'login', { next: req.query.next });
});

router.get('/register', redirectIfLoggedIn, (req, res) => {
  renderAuth(res, 'register', { next: req.query.next });
});

router.post(
  '/login',
  redirectIfLoggedIn,
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail({ gmail_remove_dots: false }),
  body('password').notEmpty().withMessage('Enter your password.'),
  async (req, res, next) => {
    try {
      const values = { loginEmail: req.body.email };
      const errors = errorMap(req);
      if (Object.keys(errors).length) {
        return renderAuth(res, 'login', { status: 400, loginErrors: errors, values, next: req.body.next });
      }

      const user = getDb()
        .prepare('SELECT id, password_hash, display_name FROM users WHERE email = ?')
        .get(req.body.email);
      const ok = user && (await bcrypt.compare(req.body.password, user.password_hash));
      if (!ok) {
        return renderAuth(res, 'login', {
          status: 401,
          loginErrors: { form: { msg: 'Incorrect email or password.' } },
          values,
          next: req.body.next,
        });
      }

      logIn(req, res, user.id, safeRedirectPath(req.body.next), `Welcome back, ${user.display_name}!`);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/register',
  redirectIfLoggedIn,
  body('display_name').trim().isLength({ min: 1, max: 50 }).withMessage('Enter a display name (up to 50 characters).'),
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail({ gmail_remove_dots: false })
    .custom((email) => {
      const taken = getDb().prepare('SELECT 1 FROM users WHERE email = ?').get(email);
      if (taken) throw new Error('An account with this email already exists.');
      return true;
    }),
  body('password').isLength({ min: MIN_PASSWORD, max: 72 })
    .withMessage(`Password must be ${MIN_PASSWORD} to 72 characters long.`),
  body('confirm_password').custom((value, { req }) => {
    if (value !== req.body.password) throw new Error('Passwords do not match.');
    return true;
  }),
  async (req, res, next) => {
    try {
      const values = { display_name: req.body.display_name, registerEmail: req.body.email };
      const errors = errorMap(req);
      if (Object.keys(errors).length) {
        return renderAuth(res, 'register', { status: 400, registerErrors: errors, values, next: req.body.next });
      }

      const passwordHash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
      const { lastInsertRowid } = getDb()
        .prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
        .run(req.body.email, passwordHash, req.body.display_name);

      logIn(req, res, lastInsertRowid, safeRedirectPath(req.body.next),
        `Welcome to Grade Tracker, ${req.body.display_name}! Your account is ready.`);
    } catch (err) {
      next(err);
    }
  }
);

// Throws away the logged-in session and starts an empty one for the goodbye message.
router.post('/logout', (req, res, next) => {
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.flash = { type: 'info', message: 'You have been logged out.' };
    req.session.save(() => res.redirect('/'));
  });
});

module.exports = router;
