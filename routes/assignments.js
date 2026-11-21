const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireLogin, safeRedirectPath } = require('../lib/auth');
const courses = require('../lib/courses');
const assignments = require('../lib/assignments');
const { isValidDue } = require('../lib/dates');

const router = express.Router();
router.use('/assignments', requireLogin);

const MAX_POINTS = 100000;

const assignmentRules = [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Enter a title (up to 200 characters).'),
  body('description').trim().isLength({ max: 2000 }).withMessage('Notes can be up to 2000 characters.'),
  body('course_id').custom((value, { req }) => {
    if (!courses.getCourse(req.user.id, Number(value))) throw new Error('Choose one of your courses.');
    return true;
  }),
  body('category_id').custom((value, { req }) => {
    const course = courses.getCourse(req.user.id, Number(req.body.course_id));
    const categories = course ? courses.getCategories(course.id) : [];
    if (!categories.some((c) => c.id === Number(value))) throw new Error('Choose a category in this course.');
    return true;
  }),
  body('due_date').custom((value) => {
    if (!isValidDue(value)) throw new Error('Enter a due date and time.');
    return true;
  }),
  body('points_possible').trim().isFloat({ gt: 0, max: MAX_POINTS })
    .withMessage('Points possible must be a number above 0.'),
  body('points_earned').trim().optional({ values: 'falsy' }).isFloat({ min: 0, max: MAX_POINTS })
    .withMessage('Points earned must be 0 or more.'),
  body('status').isIn(Object.keys(assignments.STATUSES)).withMessage('Choose a status.'),
  body('points_earned').custom((value, { req }) => {
    if (req.body.status === 'graded' && !value) throw new Error('Enter the points earned for graded work.');
    return true;
  }),
];

// Every course with its categories, for the form's two linked dropdowns.
function courseOptions(userId) {
  return courses.listCourses(userId).map((course) => ({
    ...course,
    categories: courses.getCategories(course.id),
  }));
}

function renderForm(req, res, { status = 200, assignment = null, values, errors = {} }) {
  res.status(status).render('assignments/form', {
    title: assignment ? `Edit ${assignment.title}` : 'Add Assignment',
    assignment,
    values,
    errors,
    courseOptions: courseOptions(req.user.id),
  });
}

// Loads :id for the logged-in user, or answers 404.
function loadAssignment(req, res, next) {
  const assignment = assignments.getAssignment(req.user.id, Number(req.params.id));
  if (!assignment) {
    return res.status(404).render('error', {
      title: 'Assignment not found',
      status: 404,
      message: "That assignment doesn't exist, or it isn't yours.",
    });
  }
  req.assignment = assignment;
  next();
}

// ---- Assignment Search -------------------------------------------------
// The filter box is at /assignments/search; it submits (GET) to a separate
// results view at /assignments/search/results, so a search can be bookmarked.

const SEARCH_FIELDS = ['course_id', 'category_id', 'status', 'due_from', 'due_to', 'q'];
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const isValidDate = (value) => DATE_ONLY.test(value) && isValidDue(`${value}T00:00`);

// Reads and checks the filters. Course and category ids must be the user's own.
function readSearch(req, options) {
  const values = {};
  for (const field of SEARCH_FIELDS) {
    const raw = req.query[field];
    values[field] = typeof raw === 'string' ? raw.trim() : '';
  }
  const errors = {};
  const filters = {};

  if (values.course_id) {
    const course = options.find((c) => c.id === Number(values.course_id));
    if (course) filters.courseId = course.id;
    else errors.course_id = 'Choose one of your courses.';
  }
  if (values.category_id) {
    const inScope = options
      .filter((c) => !filters.courseId || c.id === filters.courseId)
      .flatMap((c) => c.categories);
    const category = inScope.find((cat) => cat.id === Number(values.category_id));
    if (category) filters.categoryId = category.id;
    else errors.category_id = filters.courseId ? 'Choose a category in this course.' : 'Choose one of your categories.';
  }
  if (values.status) {
    if (assignments.STATUSES[values.status]) filters.status = values.status;
    else errors.status = 'Choose a status.';
  }
  for (const [field, key] of [['due_from', 'dueFrom'], ['due_to', 'dueTo']]) {
    if (!values[field]) continue;
    if (isValidDate(values[field])) filters[key] = values[field];
    else errors[field] = 'Enter a real date.';
  }
  if (filters.dueFrom && filters.dueTo && filters.dueFrom > filters.dueTo) {
    errors.due_to = 'The end date must be on or after the start date.';
  }
  if (values.q.length > 100) errors.q = 'Keywords can be up to 100 characters.';
  else if (values.q) filters.keyword = values.q;

  return { values, filters, errors };
}

// The query string for these values, leaving out empty fields.
function searchQuery(values) {
  const params = new URLSearchParams();
  for (const field of SEARCH_FIELDS) if (values[field]) params.set(field, values[field]);
  return params.toString();
}

// Plain-language list of the filters in use, for the results heading.
function describeFilters(filters, options) {
  const parts = [];
  const course = options.find((c) => c.id === filters.courseId);
  if (course) parts.push(`Course: ${course.code}`);
  if (filters.categoryId) {
    const category = options.flatMap((c) => c.categories).find((cat) => cat.id === filters.categoryId);
    parts.push(`Category: ${category.name}`);
  }
  if (filters.status) parts.push(`Status: ${assignments.STATUSES[filters.status].label}`);
  if (filters.dueFrom && filters.dueTo) parts.push(`Due ${filters.dueFrom} to ${filters.dueTo}`);
  else if (filters.dueFrom) parts.push(`Due on or after ${filters.dueFrom}`);
  else if (filters.dueTo) parts.push(`Due on or before ${filters.dueTo}`);
  if (filters.keyword) parts.push(`Keyword: "${filters.keyword}"`);
  return parts;
}

function renderSearchForm(res, { status = 200, values, errors = {}, options }) {
  res.status(status).render('assignments/search', {
    title: 'Assignment Search',
    values,
    errors,
    courseOptions: options,
  });
}

router.get('/assignments/search', (req, res) => {
  const options = courseOptions(req.user.id);
  const { values } = readSearch(req, options);
  renderSearchForm(res, { values, options });
});

router.get('/assignments/search/results', (req, res) => {
  const options = courseOptions(req.user.id);
  const { values, filters, errors } = readSearch(req, options);
  if (Object.keys(errors).length) {
    return renderSearchForm(res, { status: 400, values, errors, options });
  }
  const rows = assignments.searchAssignments(req.user.id, filters);
  const query = searchQuery(values);
  res.render('assignments/results', {
    title: 'Search Results',
    results: rows.slice(0, assignments.SEARCH_LIMIT),
    truncated: rows.length > assignments.SEARCH_LIMIT,
    activeFilters: describeFilters(filters, options),
    editSearchUrl: `/assignments/search${query ? `?${query}` : ''}`,
    returnTo: req.originalUrl,
  });
});

router.get('/assignments/new', (req, res) => {
  renderForm(req, res, {
    values: {
      course_id: req.query.course_id,
      category_id: req.query.category_id,
      status: 'not_started',
      points_possible: 100,
    },
  });
});

router.post('/assignments', assignmentRules, (req, res) => {
  const errors = validationResult(req).mapped();
  if (Object.keys(errors).length) {
    return renderForm(req, res, { status: 400, values: req.body, errors });
  }
  assignments.createAssignment(req.user.id, req.body);
  req.session.flash = { type: 'success', message: `Added ${req.body.title}.` };
  res.redirect(`/courses/${Number(req.body.course_id)}`);
});

router.get('/assignments/:id(\\d+)/edit', loadAssignment, (req, res) => {
  renderForm(req, res, { assignment: req.assignment, values: req.assignment });
});

router.post('/assignments/:id(\\d+)', loadAssignment, assignmentRules, (req, res) => {
  const errors = validationResult(req).mapped();
  if (Object.keys(errors).length) {
    return renderForm(req, res, { status: 400, assignment: req.assignment, values: req.body, errors });
  }
  assignments.updateAssignment(req.user.id, req.assignment.id, req.body);
  req.session.flash = { type: 'success', message: `Saved ${req.body.title}.` };
  res.redirect(`/courses/${Number(req.body.course_id)}`);
});

router.post('/assignments/:id(\\d+)/submit', loadAssignment, (req, res) => {
  const changed = assignments.markSubmitted(req.user.id, req.assignment.id);
  req.session.flash = changed
    ? { type: 'success', message: `Marked ${req.assignment.title} as submitted.` }
    : { type: 'info', message: `${req.assignment.title} was already submitted.` };
  // Buttons on the dashboard and search results send `return_to` to come back there.
  res.redirect(safeRedirectPath(req.body.return_to, `/courses/${req.assignment.course_id}`));
});

router.post('/assignments/:id(\\d+)/delete', loadAssignment, (req, res) => {
  assignments.deleteAssignment(req.user.id, req.assignment.id);
  req.session.flash = { type: 'success', message: `Deleted ${req.assignment.title}.` };
  res.redirect(safeRedirectPath(req.body.return_to, `/courses/${req.assignment.course_id}`));
});

module.exports = router;
