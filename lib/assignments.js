const { getDb } = require('./db');
const { toWallClock } = require('./dates');

// Every query here is limited to one user's rows, like lib/courses.js.

const STATUSES = {
  not_started: { label: 'Not started', badge: 'text-bg-secondary' },
  in_progress: { label: 'In progress', badge: 'text-bg-primary' },
  submitted: { label: 'Submitted', badge: 'text-bg-info' },
  graded: { label: 'Graded', badge: 'text-bg-success' },
};

function isOverdue(assignment) {
  return ['not_started', 'in_progress'].includes(assignment.status)
    && assignment.due_date < toWallClock();
}

function getAssignment(userId, assignmentId) {
  return getDb()
    .prepare('SELECT * FROM assignments WHERE id = ? AND user_id = ?')
    .get(assignmentId, userId);
}

function listForCourse(userId, courseId) {
  return getDb()
    .prepare('SELECT * FROM assignments WHERE user_id = ? AND course_id = ? ORDER BY due_date, id')
    .all(userId, courseId);
}

// Form fields -> row values. Entering a score means the work has been graded.
function toRow(a) {
  const earned = a.points_earned === '' || a.points_earned == null ? null : Number(a.points_earned);
  return [
    Number(a.course_id),
    Number(a.category_id),
    a.title,
    a.description || null,
    a.due_date,
    Number(a.points_possible),
    earned,
    earned === null ? a.status : 'graded',
  ];
}

function createAssignment(userId, assignment) {
  return Number(getDb().prepare(`INSERT INTO assignments
    (course_id, category_id, title, description, due_date, points_possible, points_earned, status, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...toRow(assignment), userId).lastInsertRowid);
}

function updateAssignment(userId, assignmentId, assignment) {
  return getDb().prepare(`UPDATE assignments
    SET course_id = ?, category_id = ?, title = ?, description = ?, due_date = ?,
        points_possible = ?, points_earned = ?, status = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ? AND user_id = ?`).run(...toRow(assignment), assignmentId, userId).changes > 0;
}

// Returns false if the work was already submitted or graded (left unchanged).
function markSubmitted(userId, assignmentId) {
  return getDb().prepare(`UPDATE assignments
    SET status = 'submitted', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ? AND user_id = ? AND status IN ('not_started', 'in_progress')`)
    .run(assignmentId, userId).changes > 0;
}

function deleteAssignment(userId, assignmentId) {
  return getDb().prepare('DELETE FROM assignments WHERE id = ? AND user_id = ?')
    .run(assignmentId, userId).changes > 0;
}

// Columns shown wherever assignments from several courses are listed together.
const WITH_COURSE = `SELECT a.*, c.code AS course_code, c.name AS course_name, c.color AS course_color,
    cat.name AS category_name
  FROM assignments a
  JOIN courses c ON c.id = a.course_id AND c.user_id = a.user_id
  JOIN categories cat ON cat.id = a.category_id`;

const OPEN = "a.status IN ('not_started', 'in_progress')";

const SEARCH_LIMIT = 200;

// Assignment Search. Always limited to the user's own rows, then narrowed by
// each filter that is set; every value is a bound parameter.
//   filters: { courseId, categoryId, status, dueFrom, dueTo, keyword }
//   dueFrom / dueTo are dates (YYYY-MM-DD) and include the whole day.
function searchAssignments(userId, filters = {}) {
  const where = ['a.user_id = ?'];
  const params = [userId];
  const add = (sql, ...values) => { where.push(sql); params.push(...values); };

  if (filters.courseId) add('a.course_id = ?', filters.courseId);
  if (filters.categoryId) add('a.category_id = ?', filters.categoryId);
  if (filters.status) add('a.status = ?', filters.status);
  if (filters.dueFrom) add('a.due_date >= ?', `${filters.dueFrom}T00:00`);
  if (filters.dueTo) add('a.due_date <= ?', `${filters.dueTo}T23:59`);
  if (filters.keyword) {
    // Escape LIKE wildcards so "100%" matches the text "100%", not everything.
    const like = `%${filters.keyword.replace(/[\\%_]/g, '\\$&')}%`;
    add("(a.title LIKE ? ESCAPE '\\' OR a.description LIKE ? ESCAPE '\\')", like, like);
  }

  return getDb()
    .prepare(`${WITH_COURSE} WHERE ${where.join(' AND ')} ORDER BY a.due_date, a.id LIMIT ?`)
    .all(...params, SEARCH_LIMIT + 1);
}

// Unfinished work due from now through `until` (wall-clock strings), soonest first.
function listDueBetween(userId, from, until) {
  return getDb()
    .prepare(`${WITH_COURSE} WHERE a.user_id = ? AND ${OPEN} AND a.due_date >= ? AND a.due_date <= ?
      ORDER BY a.due_date, a.id`)
    .all(userId, from, until);
}

// Unfinished work whose due date has passed, oldest first.
function listOverdue(userId, now) {
  return getDb()
    .prepare(`${WITH_COURSE} WHERE a.user_id = ? AND ${OPEN} AND a.due_date < ? ORDER BY a.due_date, a.id`)
    .all(userId, now);
}

module.exports = {
  STATUSES,
  SEARCH_LIMIT,
  isOverdue,
  getAssignment,
  listForCourse,
  searchAssignments,
  listDueBetween,
  listOverdue,
  createAssignment,
  updateAssignment,
  markSubmitted,
  deleteAssignment,
};
