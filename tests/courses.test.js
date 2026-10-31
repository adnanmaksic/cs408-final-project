const request = require('supertest');
const app = require('../app');
const { getDb } = require('../lib/db');

const PASSWORD = 'correct-horse-battery';

// Registers a user and returns a logged-in agent.
async function loggedInAgent(email) {
  const agent = request.agent(app);
  await agent.post('/register').type('form').send({
    display_name: email.split('@')[0], email, password: PASSWORD, confirm_password: PASSWORD,
  });
  return agent;
}

// Form body for a course. Category rows are parallel arrays, as the form sends them.
function courseForm(overrides = {}, categories = [['Homework', 40], ['Exams', 60]]) {
  return {
    code: 'CS 408',
    name: 'Full Stack Web Development',
    instructor: 'Dr. Rivera',
    term: 'Fall 2026',
    color: '#0d6efd',
    target_grade: '93',
    category_id: categories.map((c) => (c[2] ? String(c[2]) : '')),
    category_name: categories.map((c) => c[0]),
    category_weight: categories.map((c) => String(c[1])),
    ...overrides,
  };
}

async function createCourse(agent, overrides, categories) {
  const res = await agent.post('/courses').type('form').send(courseForm(overrides, categories));
  expect(res.status).toBe(302);
  return Number(res.headers.location.split('/').pop());
}

const categoriesOf = (courseId) =>
  getDb().prepare('SELECT id, name, weight FROM categories WHERE course_id = ? ORDER BY id').all(courseId);

let alice;
let bob;

beforeAll(async () => {
  alice = await loggedInAgent('alice@example.com');
  bob = await loggedInAgent('bob@example.com');
});

describe('course list', () => {
  test('logged-out visitors are sent to log in', async () => {
    const res = await request(app).get('/courses');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?next=%2Fcourses');
  });

  test('shows an empty state before any courses exist', async () => {
    const res = await alice.get('/courses');
    expect(res.status).toBe(200);
    expect(res.text).toContain('No courses yet');
  });

  test('lists only your own courses, filtered by term', async () => {
    await createCourse(alice, { code: 'ALICE 101', term: 'Fall 2026' });
    await createCourse(alice, { code: 'ALICE 202', term: 'Spring 2027' });
    await createCourse(bob, { code: 'BOB 999' });

    const all = await alice.get('/courses');
    expect(all.text).toContain('ALICE 101');
    expect(all.text).toContain('ALICE 202');
    expect(all.text).not.toContain('BOB 999');

    const spring = await alice.get('/courses?term=Spring%202027');
    expect(spring.text).toContain('ALICE 202');
    expect(spring.text).not.toContain('ALICE 101');
  });
});

describe('add course', () => {
  test('creates the course and its categories', async () => {
    const id = await createCourse(alice, { code: 'MATH 301' }, [['Quizzes', 25], ['Exams', 75]]);
    const course = getDb().prepare('SELECT * FROM courses WHERE id = ?').get(id);
    expect(course).toMatchObject({ code: 'MATH 301', term: 'Fall 2026', target_grade: 93 });
    expect(categoriesOf(id).map((c) => [c.name, c.weight])).toEqual([['Quizzes', 25], ['Exams', 75]]);

    const page = await alice.get(`/courses/${id}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('Quizzes');
  });

  test('accepts a single category row (sent as a string, not an array)', async () => {
    const res = await alice.post('/courses').type('form').send({
      ...courseForm({ code: 'ONE 100' }), category_id: '', category_name: 'Everything', category_weight: '100',
    });
    expect(res.status).toBe(302);
  });

  test('rejects weights that do not total 100%', async () => {
    const res = await alice.post('/courses').type('form').send(courseForm({}, [['Homework', 30], ['Exams', 50]]));
    expect(res.status).toBe(400);
    expect(res.text).toContain('Category weights must total 100% (they add up to 80%).');
  });

  test('rejects missing fields, bad weights and duplicate category names', async () => {
    const res = await alice.post('/courses').type('form')
      .send(courseForm({ code: '', target_grade: '150' }, [['Exams', 50], ['exams', 'abc']]));
    expect(res.status).toBe(400);
    expect(res.text).toContain('Enter a course code');
    expect(res.text).toContain('Target grade must be a number from 0 to 100.');
    expect(res.text).toContain('Each category needs a different name.');
    expect(res.text).toContain('Enter a weight above 0 and up to 100.');
  });

  test('rejects a course with no categories', async () => {
    const res = await alice.post('/courses').type('form').send(courseForm({}, []));
    expect(res.status).toBe(400);
    expect(res.text).toContain('Add at least one grading category.');
  });
});

describe('edit course', () => {
  test('updates details, renames, removes and adds categories', async () => {
    const id = await createCourse(alice, { code: 'EDIT 100' }, [['Homework', 40], ['Exams', 60]]);
    const [hw] = categoriesOf(id);

    const form = await alice.get(`/courses/${id}/edit`);
    expect(form.status).toBe(200);
    expect(form.text).toContain('value="EDIT 100"');

    const res = await alice.post(`/courses/${id}`).type('form')
      .send(courseForm({ code: 'EDIT 200', name: 'Renamed' }, [['Problem sets', 30, hw.id], ['Final', 70]]));
    expect(res.status).toBe(302);

    const course = getDb().prepare('SELECT code, name FROM courses WHERE id = ?').get(id);
    expect(course).toEqual({ code: 'EDIT 200', name: 'Renamed' });
    const cats = categoriesOf(id);
    expect(cats.map((c) => [c.name, c.weight])).toEqual([['Problem sets', 30], ['Final', 70]]);
    expect(cats[0].id).toBe(hw.id); // renamed in place, not replaced
  });

  test('blocks removing a category that assignments still use', async () => {
    const id = await createCourse(alice, { code: 'LOCK 100' }, [['Homework', 40], ['Exams', 60]]);
    const [hw, exams] = categoriesOf(id);
    const userId = getDb().prepare('SELECT id FROM users WHERE email = ?').pluck().get('alice@example.com');
    getDb().prepare(`INSERT INTO assignments (user_id, course_id, category_id, title, due_date, points_possible)
      VALUES (?, ?, ?, 'HW 1', '2026-11-01T23:59:00Z', 10)`).run(userId, id, hw.id);

    const res = await alice.post(`/courses/${id}`).type('form')
      .send(courseForm({ code: 'LOCK 100' }, [['Exams', 100, exams.id]]));
    expect(res.status).toBe(400);
    expect(res.text).toContain('&quot;Homework&quot; can\'t be removed while 1 assignment uses it.');
    expect(res.text).toContain(`name="category_id" value="${hw.id}"`); // row is put back in the form
    expect(categoriesOf(id)).toHaveLength(2);
  });

  test("can't use a category id from another course", async () => {
    const mine = await createCourse(alice, { code: 'MINE 100' });
    const other = await createCourse(alice, { code: 'OTHER 100' });
    const [foreign] = categoriesOf(other);

    const res = await alice.post(`/courses/${mine}`).type('form')
      .send(courseForm({ code: 'MINE 100' }, [['Stolen', 100, foreign.id]]));
    expect(res.status).toBe(400);
    expect(categoriesOf(other)[0].name).toBe(foreign.name);
  });
});

describe('delete course', () => {
  test('deletes the course with its categories and assignments', async () => {
    const id = await createCourse(alice, { code: 'GONE 100' });
    const res = await alice.post(`/courses/${id}/delete`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/courses');
    expect(getDb().prepare('SELECT COUNT(*) FROM courses WHERE id = ?').pluck().get(id)).toBe(0);
    expect(categoriesOf(id)).toHaveLength(0);
  });

  test('the list page has a confirmation modal for deleting', async () => {
    const res = await alice.get('/courses');
    expect(res.text).toContain('id="deleteCourseModal"');
    expect(res.text).toContain('data-bs-target="#deleteCourseModal"');
  });
});

describe("other users' courses", () => {
  test('cannot be viewed, edited or deleted', async () => {
    const id = await createCourse(bob, { code: 'PRIVATE 1' });
    expect((await alice.get(`/courses/${id}`)).status).toBe(404);
    expect((await alice.get(`/courses/${id}/edit`)).status).toBe(404);
    expect((await alice.post(`/courses/${id}`).type('form').send(courseForm({ code: 'HACKED' }))).status).toBe(404);
    expect((await alice.post(`/courses/${id}/delete`)).status).toBe(404);
    expect(getDb().prepare('SELECT code FROM courses WHERE id = ?').pluck().get(id)).toBe('PRIVATE 1');
  });
});
