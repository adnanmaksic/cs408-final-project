// Assignment Search, the Dashboard, and that neither ever shows another user's data.
const request = require('supertest');
const app = require('../app');
const { getDb } = require('../lib/db');
const { toWallClock } = require('../lib/dates');

const PASSWORD = 'correct-horse-battery';

async function loggedInAgent(email, name) {
  const agent = request.agent(app);
  await agent.post('/register').type('form').send({
    display_name: name, email, password: PASSWORD, confirm_password: PASSWORD,
  });
  await agent.get('/dashboard'); // use up the welcome message
  return agent;
}

async function createCourse(agent, code, categories, term = 'Fall 2026') {
  const res = await agent.post('/courses').type('form').send({
    code,
    name: `${code} course`,
    instructor: '',
    term,
    color: '#0d6efd',
    target_grade: '90',
    category_id: categories.map(() => ''),
    category_name: categories,
    category_weight: categories.map(() => String(100 / categories.length)),
  });
  const id = Number(res.headers.location.split('/').pop());
  await agent.get(res.headers.location); // use up the flash message
  const cats = Object.fromEntries(getDb()
    .prepare('SELECT name, id FROM categories WHERE course_id = ?').all(id).map((c) => [c.name, c.id]));
  return { id, cats };
}

// A wall-clock due date `days` from now (negative is in the past).
const daysFromNow = (days) => toWallClock(new Date(Date.now() + days * 24 * 60 * 60 * 1000));

// Inserts an assignment directly: { title, due, status, earned, notes }.
function addAssignment(email, course, category, a) {
  const db = getDb();
  const userId = db.prepare('SELECT id FROM users WHERE email = ?').pluck().get(email);
  return Number(db.prepare(`INSERT INTO assignments
    (user_id, course_id, category_id, title, description, due_date, points_possible, points_earned, status)
    VALUES (?, ?, ?, ?, ?, ?, 20, ?, ?)`).run(
    userId, course.id, course.cats[category], a.title, a.notes || null, a.due,
    a.earned ?? null, a.status || 'not_started',
  ).lastInsertRowid);
}

// Titles in a search results page, in order.
const titlesIn = (html) => [...html.matchAll(/href="\/assignments\/\d+\/edit">([^<]+)</g)].map((m) => m[1]);

let alice;
let bob;
let cs;
let math;
let bobCourse;
const ids = {};

beforeAll(async () => {
  alice = await loggedInAgent('alice@example.com', 'Alice');
  bob = await loggedInAgent('bob@example.com', 'Bob');
  cs = await createCourse(alice, 'CS 408', ['Homework', 'Exams']);
  math = await createCourse(alice, 'MATH 301', ['Quizzes', 'Exams']);
  bobCourse = await createCourse(bob, 'BOB 101', ['Homework']);

  const A = 'alice@example.com';
  ids.hw1 = addAssignment(A, cs, 'Homework', { title: 'Express routing', due: '2026-10-05T23:59', status: 'graded', earned: 18 });
  ids.hw2 = addAssignment(A, cs, 'Homework', { title: 'SQLite queries', due: '2026-10-20T23:59', status: 'submitted', notes: 'Use 100% parameterized SQL' });
  ids.exam = addAssignment(A, cs, 'Exams', { title: 'Midterm exam', due: '2026-10-21T09:00', status: 'not_started' });
  ids.quiz = addAssignment(A, math, 'Quizzes', { title: 'Quiz 4: eigenvalues', due: '2026-10-21T23:59', status: 'in_progress' });
  ids.mathExam = addAssignment(A, math, 'Exams', { title: 'Final exam', due: '2026-12-15T10:00', status: 'not_started' });
  ids.bob = addAssignment('bob@example.com', bobCourse, 'Homework', { title: 'Bob secret homework', due: '2026-10-21T12:00' });
});

describe('Assignment Search page', () => {
  test('logged-out visitors are sent to log in', async () => {
    for (const path of ['/assignments/search', '/assignments/search/results?q=exam']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/^\/login\?next=/);
    }
  });

  test('shows the five filters with only your own courses and categories', async () => {
    const res = await alice.get('/assignments/search');
    expect(res.status).toBe(200);
    for (const name of ['course_id', 'category_id', 'status', 'q', 'due_from', 'due_to']) {
      expect(res.text).toContain(`name="${name}"`);
    }
    expect(res.text).toContain('action="/assignments/search/results"');
    expect(res.text).toContain('CS 408: CS 408 course');
    expect(res.text).toContain('MATH 301 · Quizzes');
    expect(res.text).not.toContain('BOB 101');
    expect(res.text).not.toContain('Work in Progress');
  });

  test('keeps the filters when you come back to change them', async () => {
    const res = await alice.get(`/assignments/search?course_id=${cs.id}&status=graded&q=routing`);
    expect(res.text).toMatch(new RegExp(`value="${cs.id}" selected`));
    expect(res.text).toMatch(/value="graded" selected/);
    expect(res.text).toMatch(/name="q" value="routing"/);
  });
});

describe('search results return only matching rows', () => {
  const search = (query) => alice.get(`/assignments/search/results?${query}`);

  test('by course', async () => {
    const res = await search(`course_id=${math.id}`);
    expect(res.status).toBe(200);
    expect(titlesIn(res.text)).toEqual(['Quiz 4: eigenvalues', 'Final exam']);
    expect(res.text).toContain('Course: MATH 301');
  });

  test('by category', async () => {
    const res = await search(`category_id=${cs.cats.Homework}`);
    expect(titlesIn(res.text)).toEqual(['Express routing', 'SQLite queries']);
  });

  test('by status', async () => {
    const res = await search('status=not_started');
    expect(titlesIn(res.text)).toEqual(['Midterm exam', 'Final exam']);
    expect(res.text).toContain('Status: Not started');
  });

  test('by due-date range, including both whole days', async () => {
    const res = await search('due_from=2026-10-20&due_to=2026-10-21');
    expect(titlesIn(res.text)).toEqual(['SQLite queries', 'Midterm exam', 'Quiz 4: eigenvalues']);
    expect((await search('due_from=2026-12-01')).text).toContain('Final exam');
    expect(titlesIn((await search('due_to=2026-10-05')).text)).toEqual(['Express routing']);
  });

  test('by keyword in the title or notes, ignoring case', async () => {
    expect(titlesIn((await search('q=EXAM')).text)).toEqual(['Midterm exam', 'Final exam']);
    expect(titlesIn((await search('q=parameterized')).text)).toEqual(['SQLite queries']);
  });

  test('keywords match % and _ literally', async () => {
    expect(titlesIn((await search('q=100%25')).text)).toEqual(['SQLite queries']);
    expect(titlesIn((await search('q=%25')).text)).toEqual(['SQLite queries']);
    expect(titlesIn((await search('q=_')).text)).toEqual([]);
  });

  test('all five filters together', async () => {
    const res = await search(`course_id=${cs.id}&category_id=${cs.cats.Exams}&status=not_started`
      + '&due_from=2026-10-01&due_to=2026-10-31&q=mid');
    expect(titlesIn(res.text)).toEqual(['Midterm exam']);
    expect(res.text).toContain('1 assignment matches');
  });

  test('no matches shows an empty state', async () => {
    const res = await search('q=nothing-like-this');
    expect(res.status).toBe(200);
    expect(res.text).toContain('No assignments match');
  });

  test('results show a status badge and link back to the filled-in form', async () => {
    const res = await search('status=submitted');
    expect(res.text).toContain('text-bg-info">Submitted<');
    expect(res.text).toContain('href="/assignments/search?status=submitted"');
  });

  test('bad filters are explained on the search form', async () => {
    const cases = [
      ['status=done', 'Choose a status.'],
      ['due_from=2026-02-31', 'Enter a real date.'],
      ['due_from=2026-11-10&due_to=2026-11-01', 'The end date must be on or after the start date.'],
      [`course_id=${cs.id}&category_id=${math.cats.Quizzes}`, 'Choose a category in this course.'],
      [`q=${'x'.repeat(101)}`, 'Keywords can be up to 100 characters.'],
    ];
    for (const [query, message] of cases) {
      const res = await search(query);
      expect(res.status).toBe(400);
      expect(res.text).toContain(message);
    }
  });

  test('deleting from the results comes back to the same results', async () => {
    const id = addAssignment('alice@example.com', cs, 'Homework', { title: 'Throwaway', due: '2026-11-02T12:00' });
    const back = '/assignments/search/results?q=Throwaway';
    const res = await alice.post(`/assignments/${id}/delete`).type('form').send({ return_to: back });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(back);
    expect(titlesIn((await alice.get(back)).text)).toEqual([]);
  });

  test('return_to cannot send you to another site', async () => {
    const id = addAssignment('alice@example.com', cs, 'Homework', { title: 'Throwaway 2', due: '2026-11-02T12:00' });
    const res = await alice.post(`/assignments/${id}/delete`).type('form').send({ return_to: '//evil.example.com' });
    expect(res.headers.location).toBe(`/courses/${cs.id}`);
  });
});

describe("users can't see each other's data", () => {
  test('searching with no filters returns only your own assignments', async () => {
    const res = await alice.get('/assignments/search/results');
    const titles = titlesIn(res.text);
    expect(titles).toHaveLength(5);
    expect(titles).not.toContain('Bob secret homework');
    expect(res.text).not.toContain('BOB 101');
  });

  test("another user's course or category id is rejected, not searched", async () => {
    const byCourse = await alice.get(`/assignments/search/results?course_id=${bobCourse.id}`);
    expect(byCourse.status).toBe(400);
    expect(byCourse.text).toContain('Choose one of your courses.');
    expect(byCourse.text).not.toContain('Bob secret homework');

    const byCategory = await alice.get(`/assignments/search/results?category_id=${bobCourse.cats.Homework}`);
    expect(byCategory.status).toBe(400);
    expect(byCategory.text).toContain('Choose one of your categories.');
    expect(byCategory.text).not.toContain('Bob secret homework');
  });

  test("a keyword matching someone else's title finds nothing", async () => {
    const res = await alice.get('/assignments/search/results?q=secret');
    expect(titlesIn(res.text)).toEqual([]);
  });

  test("Bob's search and dashboard never show Alice's work", async () => {
    const search = await bob.get('/assignments/search/results?q=exam');
    expect(titlesIn(search.text)).toEqual([]);
    const all = await bob.get('/assignments/search/results');
    expect(titlesIn(all.text)).toEqual(['Bob secret homework']);
    const dashboard = await bob.get('/dashboard');
    expect(dashboard.text).not.toContain('CS 408');
    expect(dashboard.text).not.toContain('Midterm exam');
  });

  test("you can't delete or submit another user's assignment from a search page", async () => {
    const back = '/assignments/search/results';
    expect((await alice.post(`/assignments/${ids.bob}/delete`).type('form').send({ return_to: back })).status).toBe(404);
    expect((await alice.post(`/assignments/${ids.bob}/submit`).type('form').send({ return_to: back })).status).toBe(404);
    expect(getDb().prepare('SELECT status FROM assignments WHERE id = ?').pluck().get(ids.bob)).toBe('not_started');
  });
});

describe('Dashboard', () => {
  let carol;
  let course;

  beforeAll(async () => {
    carol = await loggedInAgent('carol@example.com', 'Carol');
    course = await createCourse(carol, 'HIST 210', ['Essays', 'Exams']);
    const C = 'carol@example.com';
    addAssignment(C, course, 'Essays', { title: 'Late essay', due: daysFromNow(-2) });
    addAssignment(C, course, 'Essays', { title: 'Essay draft', due: daysFromNow(1) });
    addAssignment(C, course, 'Exams', { title: 'Unit exam', due: daysFromNow(6), status: 'in_progress' });
    addAssignment(C, course, 'Essays', { title: 'Far-off paper', due: daysFromNow(12) });
    addAssignment(C, course, 'Essays', { title: 'Turned-in essay', due: daysFromNow(2), status: 'submitted' });
    addAssignment(C, course, 'Essays', { title: 'Old graded essay', due: daysFromNow(-5), status: 'graded', earned: 17 });
  });

  // The HTML of one dashboard section, by its id.
  const section = (html, id) => html.slice(html.indexOf(`id="${id}"`), html.indexOf('</section>', html.indexOf(`id="${id}"`)));

  test('lists unfinished work due in the next 7 days, soonest first', async () => {
    const res = await carol.get('/dashboard');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Hi, Carol!');
    const due = section(res.text, 'dueSoon');
    expect(titlesIn(due)).toEqual(['Essay draft', 'Unit exam']);
    expect(due).not.toContain('Far-off paper');
    expect(due).not.toContain('Turned-in essay');
  });

  test('shows overdue work in red', async () => {
    const res = await carol.get('/dashboard');
    const overdue = section(res.text, 'overdue');
    expect(titlesIn(overdue)).toEqual(['Late essay']);
    expect(overdue).toContain('text-danger');
    expect(overdue).not.toContain('Old graded essay'); // graded work is never overdue
  });

  test('shows a grade card for each course in the latest term', async () => {
    await createCourse(carol, 'OLD 100', ['All'], 'Spring 2026');
    await createCourse(carol, 'ART 105', ['Projects']);
    const res = await carol.get('/dashboard');
    const cards = section(res.text, 'gradeCards');
    expect(cards).toContain('Fall 2026');
    expect(cards).toContain('HIST 210');
    expect(cards).toContain('85%'); // 17 / 20 on the graded essay
    expect(cards).toContain('ART 105');
    expect(cards).toContain('No graded work yet');
    expect(cards).not.toContain('OLD 100');
  });

  test('Mark submitted on the dashboard comes back to the dashboard', async () => {
    const id = getDb().prepare("SELECT id FROM assignments WHERE title = 'Essay draft'").pluck().get();
    const res = await carol.post(`/assignments/${id}/submit`).type('form').send({ return_to: '/dashboard' });
    expect(res.headers.location).toBe('/dashboard');
    const after = await carol.get('/dashboard');
    expect(titlesIn(section(after.text, 'dueSoon'))).toEqual(['Unit exam']);
  });

  test('a new user is invited to add a course', async () => {
    const dave = await loggedInAgent('dave@example.com', 'Dave');
    const res = await dave.get('/dashboard');
    expect(res.text).toContain('Start by adding a course');
    expect(res.text).not.toContain('HIST 210');
  });
});
