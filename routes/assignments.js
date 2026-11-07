const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireLogin } = require('../lib/auth');
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
  res.redirect(`/courses/${req.assignment.course_id}`);
});

router.post('/assignments/:id(\\d+)/delete', loadAssignment, (req, res) => {
  assignments.deleteAssignment(req.user.id, req.assignment.id);
  req.session.flash = { type: 'success', message: `Deleted ${req.assignment.title}.` };
  res.redirect(`/courses/${req.assignment.course_id}`);
});

module.exports = router;
