const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireLogin } = require('../lib/auth');
const courses = require('../lib/courses');
const assignments = require('../lib/assignments');
const grades = require('../lib/grades');

const router = express.Router();
router.use('/courses', requireLogin);

const DEFAULT_COLOR = '#0d6efd';

const courseRules = [
  body('code').trim().isLength({ min: 1, max: 20 }).withMessage('Enter a course code (up to 20 characters), e.g. CS 408.'),
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Enter the course name (up to 100 characters).'),
  body('instructor').trim().isLength({ max: 100 }).withMessage('Instructor can be up to 100 characters.'),
  body('term').trim().isLength({ min: 1, max: 30 }).withMessage('Enter a term (up to 30 characters), e.g. Fall 2026.'),
  body('color').trim().matches(/^#[0-9a-fA-F]{6}$/).withMessage('Pick a color.'),
  body('target_grade').trim().isFloat({ min: 0, max: 100 }).withMessage('Target grade must be a number from 0 to 100.'),
];

// Form arrays arrive as a string for one row and an array for several.
const asList = (value) => (value === undefined ? [] : [].concat(value));

// Reads the category rows from the form. Rows left completely blank are ignored.
function readCategories(reqBody) {
  const ids = asList(reqBody.category_id);
  const names = asList(reqBody.category_name);
  const weights = asList(reqBody.category_weight);
  return names
    .map((name, i) => ({
      id: ids[i] ? Number(ids[i]) : null,
      name: String(name ?? '').trim(),
      weight: String(weights[i] ?? '').trim(),
    }))
    .filter((row) => row.id || row.name || row.weight);
}

// Checks the category rows. Returns { rows, rowErrors, errors }; rows get a
// numeric weight when valid. `existing` is the course's current categories (edit only).
function validateCategories(rows, existing = []) {
  const errors = [];
  const rowErrors = rows.map(() => ({}));
  const existingById = new Map(existing.map((c) => [c.id, c]));

  if (rows.length === 0) errors.push('Add at least one grading category.');

  const seen = new Set();
  rows.forEach((row, i) => {
    if (!row.name) rowErrors[i].name = 'Enter a name.';
    else if (row.name.length > 50) rowErrors[i].name = 'Up to 50 characters.';
    else if (seen.has(row.name.toLowerCase())) rowErrors[i].name = 'Each category needs a different name.';
    seen.add(row.name.toLowerCase());

    const weight = Number(row.weight);
    if (row.weight === '' || !Number.isFinite(weight) || weight <= 0 || weight > 100) {
      rowErrors[i].weight = 'Enter a weight above 0 and up to 100.';
    } else {
      row.weight = weight;
    }

    if (row.id && !existingById.has(row.id)) {
      rowErrors[i].name = 'This category does not belong to this course.';
      row.id = null;
    }
  });

  if (rowErrors.some((e) => e.name || e.weight)) {
    errors.push('Fix the highlighted categories.');
  } else if (rows.length) {
    const total = Math.round(rows.reduce((sum, r) => sum + r.weight, 0) * 100) / 100;
    if (Math.abs(total - 100) > 0.001) errors.push(`Category weights must total 100% (they add up to ${total}%).`);
  }

  // Spec: removing a category is blocked while assignments still use it.
  const kept = new Set(rows.map((r) => r.id).filter(Boolean));
  for (const cat of existing) {
    if (!kept.has(cat.id) && cat.assignment_count > 0) {
      const n = cat.assignment_count;
      errors.push(`"${cat.name}" can't be removed while ${n} assignment${n === 1 ? '' : 's'} use${n === 1 ? 's' : ''} it.`);
    }
  }

  return { rows, rowErrors, errors };
}

const DEFAULT_MINS = grades.DEFAULT_SCALE.slice(0, -1).map((s) => s.min);
const scaleMins = (course) => grades.parseScale(course.letter_scale).slice(0, -1).map((s) => s.min);

// Letter-grade cutoffs from the form (A down to D-). `json` is what gets stored:
// null when the cutoffs match the standard scale or the form left them out.
function readScale(reqBody) {
  const raw = asList(reqBody.scale_min).map((v) => String(v).trim());
  if (raw.length === 0) return { json: null, error: null };
  const mins = raw.map((v) => (v === '' ? NaN : Number(v)));
  const error = grades.checkScale(mins);
  if (error) return { json: null, error };
  const isDefault = mins.every((m, i) => m === DEFAULT_MINS[i]);
  return { json: isDefault ? null : JSON.stringify(mins), error: null };
}

function renderForm(res, { status = 200, course = null, values, categories, errors = {}, categoryErrors = [], rowErrors = [], scaleError = null }) {
  res.status(status).render('courses/form', {
    title: course ? `Edit ${course.code}` : 'Add Course',
    course,
    values,
    categories,
    errors,
    categoryErrors,
    rowErrors,
    scaleError,
    scaleLetters: grades.SCALE_LETTERS,
    scaleMins: values.scale_min ? asList(values.scale_min) : DEFAULT_MINS,
  });
}

function notFound(res) {
  res.status(404).render('error', {
    title: 'Course not found',
    status: 404,
    message: "That course doesn't exist, or it isn't yours.",
  });
}

// Loads :id for the logged-in user, or answers 404.
function loadCourse(req, res, next) {
  const course = courses.getCourse(req.user.id, Number(req.params.id));
  if (!course) return notFound(res);
  req.course = course;
  next();
}

// Course List, filtered by term.
router.get('/courses', (req, res) => {
  const terms = courses.listTerms(req.user.id);
  const term = terms.includes(req.query.term) ? req.query.term : null;
  res.render('courses/index', {
    title: 'My Courses',
    terms,
    term,
    courses: courses.listCourses(req.user.id, term).map((c) => ({ ...c, grade: courses.gradeSummary(req.user.id, c) })),
  });
});

router.get('/courses/new', (req, res) => {
  renderForm(res, {
    values: { color: DEFAULT_COLOR, target_grade: 90, term: courses.listTerms(req.user.id)[0] || '' },
    categories: [{ id: null, name: '', weight: '' }],
  });
});

router.post('/courses', courseRules, (req, res) => {
  const errors = validationResult(req).mapped();
  const { rows, rowErrors, errors: categoryErrors } = validateCategories(readCategories(req.body));
  const scale = readScale(req.body);
  if (Object.keys(errors).length || categoryErrors.length || scale.error) {
    return renderForm(res, { status: 400, values: req.body, categories: rows, errors, categoryErrors, rowErrors, scaleError: scale.error });
  }
  const id = courses.saveCourse(req.user.id, { ...req.body, letter_scale: scale.json }, rows);
  req.session.flash = { type: 'success', message: `Added ${req.body.code}.` };
  res.redirect(`/courses/${id}`);
});

router.get('/courses/:id(\\d+)', loadCourse, (req, res) => {
  const courseAssignments = assignments.listForCourse(req.user.id, req.course.id);
  const grade = courses.gradeSummary(req.user.id, req.course);
  res.render('courses/show', {
    title: req.course.code,
    course: req.course,
    grade,
    categories: grade.categories.map((cat) => ({
      ...cat,
      assignments: courseAssignments.filter((a) => a.category_id === cat.id),
    })),
  });
});

router.get('/courses/:id(\\d+)/edit', loadCourse, (req, res) => {
  renderForm(res, {
    course: req.course,
    values: { ...req.course, scale_min: scaleMins(req.course) },
    categories: courses.getCategories(req.course.id),
  });
});

router.post('/courses/:id(\\d+)', loadCourse, courseRules, (req, res) => {
  const errors = validationResult(req).mapped();
  const existing = courses.getCategories(req.course.id);
  const { rows, rowErrors, errors: categoryErrors } = validateCategories(readCategories(req.body), existing);
  const scale = readScale(req.body);
  if (Object.keys(errors).length || categoryErrors.length || scale.error) {
    // Keep each row's assignment count so the form can still lock in-use rows,
    // and put back any in-use category the user tried to remove.
    const counts = new Map(existing.map((c) => [c.id, c.assignment_count]));
    const categories = rows.map((r) => ({ ...r, assignment_count: counts.get(r.id) || 0 }));
    const kept = new Set(rows.map((r) => r.id));
    for (const cat of existing) {
      if (cat.assignment_count > 0 && !kept.has(cat.id)) {
        categories.push(cat);
        rowErrors.push({});
      }
    }
    return renderForm(res, { status: 400, course: req.course, values: req.body, categories, errors, categoryErrors, rowErrors, scaleError: scale.error });
  }
  courses.saveCourse(req.user.id, { ...req.body, letter_scale: scale.json }, rows, req.course.id);
  req.session.flash = { type: 'success', message: `Saved ${req.body.code}.` };
  res.redirect(`/courses/${req.course.id}`);
});

// Grade Calculator. The target grade and what-if scores arrive in the query
// string (target=93&whatif_12=18), so nothing is saved and the page works
// without JavaScript; public/js/calculator.js updates it live as you type.
router.get('/courses/:id(\\d+)/calculator', loadCourse, (req, res) => {
  const errors = {};
  let target = req.course.target_grade;
  const rawTarget = req.query.target === undefined ? '' : String(req.query.target).trim();
  if (rawTarget !== '') {
    const n = Number(rawTarget);
    if (Number.isFinite(n) && n >= 0 && n <= 100) target = n;
    else errors.target = 'Target grade must be a number from 0 to 100.';
  }

  const courseAssignments = assignments.listForCourse(req.user.id, req.course.id);
  const categories = courses.getCategories(req.course.id);
  const ungraded = courseAssignments.filter((a) => !grades.isGraded(a));
  const whatIf = {};
  const whatIfValues = {};
  for (const a of ungraded) {
    const raw = req.query[`whatif_${a.id}`];
    if (raw === undefined || String(raw).trim() === '') continue;
    whatIfValues[a.id] = String(raw).trim();
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) whatIf[a.id] = n;
    else errors[`whatif_${a.id}`] = 'Enter 0 or more points.';
  }

  res.status(Object.keys(errors).length ? 400 : 200).render('courses/calculator', {
    title: `${req.course.code} Grade Calculator`,
    course: req.course,
    target,
    targetValue: rawTarget === '' ? req.course.target_grade : rawTarget,
    errors,
    current: courses.gradeSummary(req.user.id, req.course, { target }),
    whatIfGrade: courses.gradeSummary(req.user.id, req.course, { target, whatIf }),
    ungraded: ungraded.map((a) => ({ ...a, categoryName: (categories.find((c) => c.id === a.category_id) || {}).name })),
    whatIfValues,
    // Lets public/js/calculator.js redo the math in the browser with lib/grades.js.
    calcData: {
      categories: categories.map(({ id, name, weight }) => ({ id, name, weight })),
      assignments: courseAssignments.map(({ id, category_id, points_possible, points_earned }) => ({
        id, category_id, points_possible, points_earned,
      })),
      scale: grades.parseScale(req.course.letter_scale),
    },
  });
});

router.post('/courses/:id(\\d+)/delete', loadCourse, (req, res) => {
  courses.deleteCourse(req.user.id, req.course.id);
  req.session.flash = { type: 'success', message: `Deleted ${req.course.code} and everything in it.` };
  res.redirect('/courses');
});

module.exports = router;
