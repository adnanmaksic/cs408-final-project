// Grades on the course pages, the Grade Calculator and per-course letter cutoffs.
const request = require('supertest');
const app = require('../app');
const { getDb } = require('../lib/db');

const PASSWORD = 'correct-horse-battery';

async function loggedInAgent(email) {
  const agent = request.agent(app);
  await agent.post('/register').type('form').send({
    display_name: email.split('@')[0], email, password: PASSWORD, confirm_password: PASSWORD,
  });
  await agent.get('/dashboard'); // use up the welcome message
  return agent;
}

function courseForm(overrides = {}) {
  return {
    code: 'STAT 301',
    name: 'Statistics',
    instructor: '',
    term: 'Fall 2026',
    color: '#198754',
    target_grade: '85',
    category_id: ['', '', ''],
    category_name: ['Homework', 'Exams', 'Final'],
    category_weight: ['30', '50', '20'],
    ...overrides,
  };
}

async function createCourse(agent, overrides) {
  const res = await agent.post('/courses').type('form').send(courseForm(overrides));
  expect(res.status).toBe(302);
  const id = Number(res.headers.location.split('/').pop());
  await agent.get(res.headers.location); // use up the flash message
  return id;
}

// Adds assignments straight to the database: [categoryName, title, earned, possible].
function addAssignments(userEmail, courseId, rows) {
  const db = getDb();
  const userId = db.prepare('SELECT id FROM users WHERE email = ?').pluck().get(userEmail);
  const cats = db.prepare('SELECT id, name FROM categories WHERE course_id = ?').all(courseId);
  const insert = db.prepare(`INSERT INTO assignments
    (user_id, course_id, category_id, title, due_date, points_possible, points_earned, status)
    VALUES (?, ?, ?, ?, '2030-12-01T23:59', ?, ?, ?)`);
  return rows.map(([cat, title, earned, possible]) => Number(insert.run(
    userId, courseId, cats.find((c) => c.name === cat).id, title, possible, earned,
    earned === null ? 'not_started' : 'graded',
  ).lastInsertRowid));
}

let alice;
let bob;
let courseId;
let midterm2;

beforeAll(async () => {
  alice = await loggedInAgent('alice@example.com');
  bob = await loggedInAgent('bob@example.com');
  courseId = await createCourse(alice);
  // The About page's worked example: Homework 90%, Exams 80%, Final not taken = 83.75%.
  [, , , midterm2] = addAssignments('alice@example.com', courseId, [
    ['Homework', 'HW 1', 18, 20],
    ['Homework', 'HW 2', 27, 30],
    ['Exams', 'Midterm 1', 80, 100],
    ['Exams', 'Midterm 2', null, 100],
  ]);
});

describe('grades on course pages', () => {
  test('Course Detail shows the current grade, letter and category grades', async () => {
    const res = await alice.get(`/courses/${courseId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('83.75%');
    expect(res.text).toMatch(/text-bg-primary">B</);
    expect(res.text).toContain('Based on 80% of the course graded so far.');
    expect(res.text).toContain('90%'); // Homework
    expect(res.text).toContain('(45 / 50 pts)');
    expect(res.text).toContain('(80 / 100 pts)');
    expect(res.text).toContain('No grades yet'); // Final
    expect(res.text).toContain(`href="/courses/${courseId}/calculator"`);
    expect(res.text).not.toContain('Work in Progress');
  });

  test('Course Detail says what is needed for the course target', async () => {
    // Target 85: base 27 + 20 = 47, remaining weight 45%: (85 - 47) / 0.45 = 84.44%
    const res = await alice.get(`/courses/${courseId}`);
    expect(res.text).toContain('You need an average of 84.44% on the remaining work to reach 85%.');
  });

  test('the course list shows each grade and letter', async () => {
    const res = await alice.get('/courses');
    expect(res.text).toContain('83.75%');
    expect(res.text).toMatch(/border ms-2">B</);
  });

  test('a course with nothing graded shows a dash', async () => {
    const empty = await createCourse(alice, { code: 'EMPTY 100' });
    const res = await alice.get(`/courses/${empty}`);
    expect(res.text).toContain('No graded work yet.');
  });
});

describe('Grade Calculator', () => {
  test('logged-out visitors are sent to log in', async () => {
    const res = await request(app).get(`/courses/${courseId}/calculator`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login\?next=/);
  });

  test('shows the current grade, the course target and the needed score', async () => {
    const res = await alice.get(`/courses/${courseId}/calculator`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Grade Calculator');
    expect(res.text).toContain('83.75%');
    expect(res.text).toMatch(/id="target"[^>]*value="85"/);
    expect(res.text).toContain('You need an average of 84.44% on the remaining work to reach 85%.');
    expect(res.text).toContain('Midterm 2');
    expect(res.text).toContain(`name="whatif_${midterm2}"`);
    expect(res.text).not.toContain('name="whatif_1"'); // graded work has no what-if box
    expect(res.text).toContain('<script src="/js/grades.js">');
  });

  test('a different target changes the needed score without saving it', async () => {
    const res = await alice.get(`/courses/${courseId}/calculator?target=93`);
    expect(res.text).toContain('93% is out of reach: even 100% on the remaining work ends at 92%.');
    expect(getDb().prepare('SELECT target_grade FROM courses WHERE id = ?').pluck().get(courseId)).toBe(85);
  });

  test('what-if scores show the resulting grade and what is still needed', async () => {
    // Midterm 2 at 90/100: Exams 170/200 = 85%, so (27 + 42.5) / 0.8 = 86.875%.
    const res = await alice.get(`/courses/${courseId}/calculator?target=85&whatif_${midterm2}=90`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('86.88%');
    expect(res.text).toContain('Using 1 what-if score.');
    // Only the Final is left: 27 + 42.5 = 69.5, (85 - 69.5) / 0.2 = 77.5%
    expect(res.text).toContain('You need an average of 77.5% on the remaining work to reach 85%.');
    expect(res.text).toMatch(new RegExp(`name="whatif_${midterm2}"[^>]*value="90"`));
    // Nothing was saved.
    expect(getDb().prepare('SELECT points_earned FROM assignments WHERE id = ?').pluck().get(midterm2)).toBeNull();
  });

  test('a bad target or what-if score is explained', async () => {
    const badTarget = await alice.get(`/courses/${courseId}/calculator?target=150`);
    expect(badTarget.status).toBe(400);
    expect(badTarget.text).toContain('Target grade must be a number from 0 to 100.');

    const badScore = await alice.get(`/courses/${courseId}/calculator?whatif_${midterm2}=-4`);
    expect(badScore.status).toBe(400);
    expect(badScore.text).toContain('Enter 0 or more points.');
  });

  test("what-if boxes ignore other users' assignment ids", async () => {
    const res = await alice.get(`/courses/${courseId}/calculator?whatif_999999=50`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Type scores below to try them out.');
  });

  test("other users' calculators are not found", async () => {
    expect((await bob.get(`/courses/${courseId}/calculator`)).status).toBe(404);
  });

  test('the grade math is served to the browser', async () => {
    const res = await request(app).get('/js/grades.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.text).toContain('root.Grades = factory()');
  });
});

describe('letter grade cutoffs', () => {
  const custom = ['90', '88', '86', '80', '78', '76', '70', '68', '66', '60', '58'];

  test('the course form shows the standard scale by default', async () => {
    const res = await alice.get('/courses/new');
    expect(res.text).toContain('Letter grade cutoffs');
    expect(res.text).toMatch(/id="scale_0"[^>]*value="93"/);
    expect(res.text).toMatch(/id="scale_10"[^>]*value="60"/);
  });

  test('the standard scale is not stored', async () => {
    const id = await createCourse(alice, {
      code: 'STD 1', scale_min: ['93', '90', '87', '83', '80', '77', '73', '70', '67', '63', '60'],
    });
    expect(getDb().prepare('SELECT letter_scale FROM courses WHERE id = ?').pluck().get(id)).toBeNull();
  });

  test('custom cutoffs are saved, shown on the form and used for letters', async () => {
    const id = await createCourse(alice, { code: 'CUSTOM 1', scale_min: custom });
    expect(JSON.parse(getDb().prepare('SELECT letter_scale FROM courses WHERE id = ?').pluck().get(id)))
      .toEqual(custom.map(Number));
    addAssignments('alice@example.com', id, [['Homework', 'HW 1', 90, 100]]);

    const show = await alice.get(`/courses/${id}`);
    expect(show.text).toMatch(/text-bg-primary">A</); // 90% is an A here, A- on the standard scale

    const edit = await alice.get(`/courses/${id}/edit`);
    expect(edit.text).toMatch(/id="scale_0"[^>]*value="90"/);
  });

  test('cutoffs out of order are rejected and the form keeps what was typed', async () => {
    const res = await alice.post('/courses').type('form')
      .send(courseForm({ code: 'BAD 1', scale_min: ['93', '95', '87', '83', '80', '77', '73', '70', '67', '63', '60'] }));
    expect(res.status).toBe(400);
    expect(res.text).toContain('The A- cutoff must be lower than the A cutoff.');
    expect(res.text).toMatch(/id="scale_1"[^>]*value="95"/);
    expect(getDb().prepare("SELECT COUNT(*) FROM courses WHERE code = 'BAD 1'").pluck().get()).toBe(0);
  });

  test('editing a course can go back to the standard scale', async () => {
    const id = await createCourse(alice, { code: 'CUSTOM 2', scale_min: custom });
    const res = await alice.post(`/courses/${id}`).type('form').send(courseForm({
      code: 'CUSTOM 2',
      category_id: getDb().prepare('SELECT id FROM categories WHERE course_id = ? ORDER BY id').pluck().all(id).map(String),
      scale_min: ['93', '90', '87', '83', '80', '77', '73', '70', '67', '63', '60'],
    }));
    expect(res.status).toBe(302);
    expect(getDb().prepare('SELECT letter_scale FROM courses WHERE id = ?').pluck().get(id)).toBeNull();
  });
});
