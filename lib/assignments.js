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

module.exports = {
  STATUSES,
  isOverdue,
  getAssignment,
  listForCourse,
  createAssignment,
  updateAssignment,
  markSubmitted,
  deleteAssignment,
};
