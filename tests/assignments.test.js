const request = require('supertest');
const app = require('../app');
const { getDb } = require('../lib/db');
const { isValidDue, formatDue, toWallClock } = require('../lib/dates');

const PASSWORD = 'correct-horse-battery';

async function loggedInAgent(email) {
  const agent = request.agent(app);
  await agent.post('/register').type('form').send({
    display_name: email.split('@')[0], email, password: PASSWORD, confirm_password: PASSWORD,
  });
  await agent.get('/dashboard'); // use up the welcome message
  return agent;
}

async function createCourse(agent, code, categories = ['Homework', 'Exams']) {
  const res = await agent.post('/courses').type('form').send({
    code,
    name: `${code} course`,
    instructor: '',
    term: 'Fall 2026',
    color: '#0d6efd',
    target_grade: '90',
    category_id: categories.map(() => ''),
    category_name: categories,
    category_weight: categories.map(() => String(100 / categories.length)),
  });
  const id = Number(res.headers.location.split('/').pop());
  await agent.get(res.headers.location); // use up the flash message
  const cats = getDb().prepare('SELECT id, name FROM categories WHERE course_id = ? ORDER BY id').all(id);
  return { id, categories: cats };
}

function assignmentForm(course, overrides = {}) {
  return {
    title: 'Homework 1',
    description: '',
    course_id: String(course.id),
    category_id: String(course.categories[0].id),
    due_date: '2030-11-20T23:59',
    points_possible: '20',
    points_earned: '',
    status: 'not_started',
    ...overrides,
  };
}

async function createAssignment(agent, course, overrides) {
  const res = await agent.post('/assignments').type('form').send(assignmentForm(course, overrides));
  expect(res.status).toBe(302);
  await agent.get(res.headers.location); // use up the flash message
  return getDb().prepare('SELECT * FROM assignments ORDER BY id DESC LIMIT 1').get();
}

let alice;
let bob;
let course;
let otherCourse;

beforeAll(async () => {
  alice = await loggedInAgent('alice@example.com');
  bob = await loggedInAgent('bob@example.com');
  course = await createCourse(alice, 'CS 408');
  otherCourse = await createCourse(alice, 'MATH 301');
});

describe('login is required', () => {
  test.each([
    ['get', '/assignments/new'],
    ['post', '/assignments'],
    ['get', '/assignments/1/edit'],
    ['post', '/assignments/1'],
    ['post', '/assignments/1/submit'],
    ['post', '/assignments/1/delete'],
  ])('%s %s redirects logged-out visitors', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });
});

describe('GET /assignments/new', () => {
  test('offers your courses and categories, with the linked one selected', async () => {
    const [, exams] = course.categories;
    const res = await alice.get(`/assignments/new?course_id=${course.id}&category_id=${exams.id}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(`<option value="${course.id}" selected>CS 408: CS 408 course</option>`);
    expect(res.text).toContain(`<option value="${exams.id}" data-course="${course.id}" selected>`);
  });

  test('asks for a course first when you have none', async () => {
    const res = await bob.get('/assignments/new');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Add a course first');
  });
});

describe('POST /assignments', () => {
  test('creates an assignment and lists it under its category', async () => {
    const res = await alice.post('/assignments').type('form')
      .send(assignmentForm(course, { title: 'Pug exercise', description: 'Chapter 4' }));
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/courses/${course.id}`);

    const row = getDb().prepare('SELECT * FROM assignments WHERE title = ?').get('Pug exercise');
    expect(row).toMatchObject({
      course_id: course.id,
      category_id: course.categories[0].id,
      due_date: '2030-11-20T23:59',
      points_possible: 20,
      points_earned: null,
      status: 'not_started',
      description: 'Chapter 4',
    });

    const page = await alice.get(`/courses/${course.id}`);
    expect(page.text).toContain('Pug exercise');
    expect(page.text).toContain('Wed, Nov 20, 11:59 PM');
    expect(page.text).toContain('Not started');
  });

  test('a score marks the work as graded', async () => {
    const row = await createAssignment(alice, course, { title: 'Scored', points_earned: '18' });
    expect(row).toMatchObject({ points_earned: 18, status: 'graded' });
    const page = await alice.get(`/courses/${course.id}`);
    expect(page.text).toContain('18 / 20');
  });

  test('a score of zero counts', async () => {
    const row = await createAssignment(alice, course, { title: 'Zero', points_earned: '0' });
    expect(row).toMatchObject({ points_earned: 0, status: 'graded' });
  });

  test('graded work needs a score', async () => {
    const res = await alice.post('/assignments').type('form').send(assignmentForm(course, { status: 'graded' }));
    expect(res.status).toBe(400);
    expect(res.text).toContain('Enter the points earned for graded work.');
  });

  test('shows validation errors and keeps the entered values', async () => {
    const res = await alice.post('/assignments').type('form').send(assignmentForm(course, {
      title: '', description: 'Kept notes', due_date: '2030-02-31T10:00', points_possible: '0', points_earned: '-1', status: 'nope',
    }));
    expect(res.status).toBe(400);
    expect(res.text).toContain('Enter a title');
    expect(res.text).toContain('Enter a due date and time.');
    expect(res.text).toContain('Points possible must be a number above 0.');
    expect(res.text).toContain('Points earned must be 0 or more.');
    expect(res.text).toContain('Choose a status.');
    expect(res.text).toContain('Kept notes');
  });

  test("rejects a category from a different course", async () => {
    const res = await alice.post('/assignments').type('form')
      .send(assignmentForm(course, { category_id: String(otherCourse.categories[0].id) }));
    expect(res.status).toBe(400);
    expect(res.text).toContain('Choose a category in this course.');
  });

  test("rejects another user's course", async () => {
    await createCourse(bob, 'BOB 050');
    const res = await bob.post('/assignments').type('form').send(assignmentForm(course));
    expect(res.status).toBe(400);
    expect(res.text).toContain('Choose one of your courses.');
  });
});

describe('editing', () => {
  test('GET /assignments/:id/edit shows the saved values', async () => {
    const row = await createAssignment(alice, course, { title: 'Edit me' });
    const res = await alice.get(`/assignments/${row.id}/edit`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('value="Edit me"');
    expect(res.text).toContain('value="2030-11-20T23:59"');
    expect(res.text).toContain('id="deleteAssignmentModal"');
  });

  test('POST /assignments/:id updates every field and can move courses', async () => {
    const row = await createAssignment(alice, course, { title: 'Move me' });
    const res = await alice.post(`/assignments/${row.id}`).type('form').send(assignmentForm(otherCourse, {
      title: 'Moved', due_date: '2030-12-01T08:30', points_possible: '50', status: 'in_progress',
    }));
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/courses/${otherCourse.id}`);
    expect(getDb().prepare('SELECT * FROM assignments WHERE id = ?').get(row.id)).toMatchObject({
      title: 'Moved',
      course_id: otherCourse.id,
      category_id: otherCourse.categories[0].id,
      due_date: '2030-12-01T08:30',
      points_possible: 50,
      status: 'in_progress',
    });
  });

  test('POST /assignments/:id shows validation errors', async () => {
    const row = await createAssignment(alice, course);
    const res = await alice.post(`/assignments/${row.id}`).type('form').send(assignmentForm(course, { title: '' }));
    expect(res.status).toBe(400);
    expect(res.text).toContain('Enter a title');
  });

  test('clearing a score lets graded work go back to submitted', async () => {
    const row = await createAssignment(alice, course, { points_earned: '10' });
    await alice.post(`/assignments/${row.id}`).type('form').send(assignmentForm(course, { status: 'submitted' }));
    expect(getDb().prepare('SELECT status, points_earned FROM assignments WHERE id = ?').get(row.id))
      .toEqual({ status: 'submitted', points_earned: null });
  });
});

describe('POST /assignments/:id/submit', () => {
  test('marks work as submitted and removes the button', async () => {
    const row = await createAssignment(alice, course, { status: 'in_progress' });
    const before = await alice.get(`/courses/${course.id}`);
    expect(before.text).toContain(`action="/assignments/${row.id}/submit"`);

    const res = await alice.post(`/assignments/${row.id}/submit`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/courses/${course.id}`);
    expect(getDb().prepare('SELECT status FROM assignments WHERE id = ?').pluck().get(row.id)).toBe('submitted');

    const after = await alice.get(`/courses/${course.id}`);
    expect(after.text).not.toContain(`action="/assignments/${row.id}/submit"`);
  });

  test('does not undo a grade', async () => {
    const row = await createAssignment(alice, course, { points_earned: '20' });
    await alice.post(`/assignments/${row.id}/submit`);
    expect(getDb().prepare('SELECT status FROM assignments WHERE id = ?').pluck().get(row.id)).toBe('graded');
  });
});

describe('POST /assignments/:id/delete', () => {
  test('deletes the assignment and frees its category', async () => {
    const extra = await createCourse(alice, 'FREE 100');
    const row = await createAssignment(alice, extra);
    const res = await alice.post(`/assignments/${row.id}/delete`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/courses/${extra.id}`);
    expect(getDb().prepare('SELECT COUNT(*) FROM assignments WHERE id = ?').pluck().get(row.id)).toBe(0);
  });
});

describe('course detail', () => {
  test('lists assignments under their own category, with empty categories labeled', async () => {
    const detail = await createCourse(alice, 'DETAIL 1');
    await createAssignment(alice, detail, { title: 'In homework' });
    const res = await alice.get(`/courses/${detail.id}`);
    const homework = res.text.indexOf('In homework');
    expect(homework).toBeGreaterThan(res.text.indexOf('>Homework'));
    expect(homework).toBeLessThan(res.text.indexOf('>Exams'));
    expect(res.text).toContain('No assignments yet.');
  });

  test('flags overdue work, but not work already submitted', async () => {
    const detail = await createCourse(alice, 'LATE 1');
    await createAssignment(alice, detail, { due_date: '2020-01-01T12:00' });
    expect((await alice.get(`/courses/${detail.id}`)).text).toContain('Overdue');

    const row = getDb().prepare('SELECT id FROM assignments ORDER BY id DESC LIMIT 1').get();
    await alice.post(`/assignments/${row.id}/submit`);
    expect((await alice.get(`/courses/${detail.id}`)).text).not.toContain('Overdue');
  });
});

describe("other users' assignments", () => {
  test('cannot be viewed, changed, submitted or deleted', async () => {
    const row = await createAssignment(alice, course, { title: 'Private' });
    const bobCourse = await createCourse(bob, 'BOB 100');

    expect((await bob.get(`/assignments/${row.id}/edit`)).status).toBe(404);
    expect((await bob.post(`/assignments/${row.id}`).type('form').send(assignmentForm(bobCourse))).status).toBe(404);
    expect((await bob.post(`/assignments/${row.id}/submit`)).status).toBe(404);
    expect((await bob.post(`/assignments/${row.id}/delete`)).status).toBe(404);
    expect(getDb().prepare('SELECT title, status FROM assignments WHERE id = ?').get(row.id))
      .toEqual({ title: 'Private', status: 'not_started' });
  });
});

describe('due date helpers', () => {
  test('isValidDue accepts real times and rejects impossible ones', () => {
    expect(isValidDue('2030-11-20T23:59')).toBe(true);
    expect(isValidDue('2030-02-31T10:00')).toBe(false);
    expect(isValidDue('2030-11-20')).toBe(false);
    expect(isValidDue(undefined)).toBe(false);
  });

  test('formatDue keeps the wall-clock time', () => {
    expect(formatDue('2030-11-20T23:59')).toBe('Wed, Nov 20, 11:59 PM');
  });

  test('toWallClock uses the same format as the form', () => {
    expect(toWallClock(new Date(2030, 10, 5, 7, 3))).toBe('2030-11-05T07:03');
  });
});
