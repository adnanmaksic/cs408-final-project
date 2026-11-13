const { getDb } = require('./db');
const grades = require('./grades');

// Every query here is limited to one user's rows, so nobody can read or
// change another user's courses by guessing an id.

// The user's terms, most recently used first (for the term dropdown).
function listTerms(userId) {
  return getDb()
    .prepare('SELECT term FROM courses WHERE user_id = ? GROUP BY term ORDER BY MAX(id) DESC')
    .pluck()
    .all(userId);
}

function listCourses(userId, term = null) {
  return getDb().prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM categories WHERE course_id = c.id) AS category_count,
      (SELECT COUNT(*) FROM assignments WHERE course_id = c.id) AS assignment_count
    FROM courses c
    WHERE c.user_id = ? AND (? IS NULL OR c.term = ?)
    ORDER BY c.term, c.code COLLATE NOCASE
  `).all(userId, term, term);
}

function getCourse(userId, courseId) {
  return getDb()
    .prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?')
    .get(courseId, userId);
}

// A course's categories with how many assignments use each one.
function getCategories(courseId) {
  return getDb().prepare(`
    SELECT cat.id, cat.name, cat.weight, COUNT(a.id) AS assignment_count
    FROM categories cat
    LEFT JOIN assignments a ON a.category_id = cat.id
    WHERE cat.course_id = ?
    GROUP BY cat.id
    ORDER BY cat.id
  `).all(courseId);
}

// Creates a course (courseId null) or updates one, and makes its categories
// match `categories` exactly: rows with an id are updated, rows without one
// are added, and existing categories not in the list are deleted. Callers
// validate first, including that deleted categories have no assignments.
function saveCourse(userId, course, categories, courseId = null) {
  const db = getDb();
  return db.transaction(() => {
    const fields = [course.code, course.name, course.instructor || null, course.term, course.color, course.target_grade, course.letter_scale ?? null];
    let id = courseId;
    if (id) {
      const { changes } = db.prepare(`UPDATE courses
        SET code = ?, name = ?, instructor = ?, term = ?, color = ?, target_grade = ?, letter_scale = ?
        WHERE id = ? AND user_id = ?`).run(...fields, id, userId);
      if (!changes) throw new Error('Course not found');
    } else {
      id = db.prepare(`INSERT INTO courses (code, name, instructor, term, color, target_grade, letter_scale, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(...fields, userId).lastInsertRowid;
    }

    const keep = new Set(categories.filter((c) => c.id).map((c) => c.id));
    const remove = db.prepare('DELETE FROM categories WHERE id = ? AND course_id = ?');
    for (const existing of getCategories(id)) {
      if (!keep.has(existing.id)) remove.run(existing.id, id);
    }

    const update = db.prepare('UPDATE categories SET name = ?, weight = ? WHERE id = ? AND course_id = ?');
    const insert = db.prepare('INSERT INTO categories (course_id, name, weight) VALUES (?, ?, ?)');
    for (const cat of categories) {
      if (cat.id) update.run(cat.name, cat.weight, cat.id, id);
      else insert.run(id, cat.name, cat.weight);
    }
    return Number(id);
  })();
}

// A course's grade (see lib/grades.js), optionally with what-if scores.
function gradeSummary(userId, course, { target = course.target_grade, whatIf = {} } = {}) {
  const assignments = getDb()
    .prepare('SELECT id, category_id, points_possible, points_earned FROM assignments WHERE user_id = ? AND course_id = ?')
    .all(userId, course.id);
  return grades.summarize({
    categories: getCategories(course.id),
    assignments,
    target,
    scale: grades.parseScale(course.letter_scale),
    whatIf,
  });
}

// Deletes a course; its categories and assignments go with it (ON DELETE CASCADE).
function deleteCourse(userId, courseId) {
  return getDb().prepare('DELETE FROM courses WHERE id = ? AND user_id = ?').run(courseId, userId).changes > 0;
}

module.exports = { listTerms, listCourses, getCourse, getCategories, saveCourse, deleteCourse, gradeSummary };
