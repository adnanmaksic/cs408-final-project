const { getDb } = require('./db');

// Loads the logged-in user (if any) onto req.user and res.locals.currentUser.
function loadUser(req, res, next) {
  res.locals.currentUser = null;
  const userId = req.session.userId;
  if (userId) {
    const user = getDb()
      .prepare('SELECT id, email, display_name FROM users WHERE id = ?')
      .get(userId);
    if (user) {
      req.user = user;
      res.locals.currentUser = user;
    } else {
      delete req.session.userId; // account no longer exists
    }
  }
  next();
}

// Only allows a same-site path like "/courses", never "//evil.com" or "https://...".
function safeRedirectPath(value, fallback = '/dashboard') {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : fallback;
}

// Sends logged-out visitors to the login page, then back here after they log in.
function requireLogin(req, res, next) {
  if (req.user) return next();
  req.session.flash = { type: 'warning', message: 'Please log in to see that page.' };
  res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

// Logged-in users don't need the login or register forms.
function redirectIfLoggedIn(req, res, next) {
  if (req.user) return res.redirect('/dashboard');
  next();
}

// One-time messages shown on the next page (e.g. "You have been logged out").
function flash(req, res, next) {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
}

module.exports = { loadUser, requireLogin, redirectIfLoggedIn, flash, safeRedirectPath };
