const request = require('supertest');
const app = require('../app');
const { getDb } = require('../lib/db');
const { seed, DEMO_EMAIL, DEMO_PASSWORD } = require('../db/seed');

const PASSWORD = 'correct-horse-battery';

function register(agent, overrides = {}) {
  return agent.post('/register').type('form').send({
    display_name: 'Test Student',
    email: 'student@example.com',
    password: PASSWORD,
    confirm_password: PASSWORD,
    ...overrides,
  });
}

describe('database', () => {
  test('migrations create all four tables plus sessions', () => {
    const tables = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .pluck()
      .all();
    expect(tables).toEqual(expect.arrayContaining(['users', 'courses', 'categories', 'assignments', 'sessions']));
  });

  test('seed adds a demo account with data in every table, and is safe to rerun', () => {
    expect(seed()).toBe(true);
    expect(seed()).toBe(false);
    const db = getDb();
    for (const table of ['users', 'courses', 'categories', 'assignments']) {
      expect(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get()).toBeGreaterThan(0);
    }
  });

  test('deleting a course cascades to its categories and assignments', () => {
    const db = getDb();
    const courseId = db.prepare('SELECT id FROM courses LIMIT 1').pluck().get();
    db.prepare('DELETE FROM courses WHERE id = ?').run(courseId);
    expect(db.prepare('SELECT COUNT(*) FROM categories WHERE course_id = ?').pluck().get(courseId)).toBe(0);
    expect(db.prepare('SELECT COUNT(*) FROM assignments WHERE course_id = ?').pluck().get(courseId)).toBe(0);
  });
});

describe('register', () => {
  test('creates an account with a bcrypt-hashed password and logs the user in', async () => {
    const agent = request.agent(app);
    const res = await register(agent);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard');

    const user = getDb().prepare('SELECT * FROM users WHERE email = ?').get('student@example.com');
    expect(user.display_name).toBe('Test Student');
    expect(user.password_hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(user.password_hash).not.toContain(PASSWORD);

    const dashboard = await agent.get('/dashboard');
    expect(dashboard.status).toBe(200);
    expect(dashboard.text).toContain('Hi, Test Student!');
  });

  test('rejects a duplicate email', async () => {
    const res = await register(request(app), { email: 'STUDENT@example.com' });
    expect(res.status).toBe(400);
    expect(res.text).toContain('An account with this email already exists.');
  });

  test('shows validation errors and keeps the entered values', async () => {
    const res = await register(request(app), {
      display_name: 'Kept Name',
      email: 'not-an-email',
      password: 'short',
      confirm_password: 'different',
    });
    expect(res.status).toBe(400);
    expect(res.text).toContain('Enter a valid email address.');
    expect(res.text).toContain('Password must be 8 to 72 characters long.');
    expect(res.text).toContain('Passwords do not match.');
    expect(res.text).toContain('value="Kept Name"');
  });
});

describe('log in and log out', () => {
  test('rejects a wrong password without saying which field was wrong', async () => {
    const res = await request(app).post('/login').type('form')
      .send({ email: 'student@example.com', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.text).toContain('Incorrect email or password.');
  });

  test('logs in, shows the user in the navbar, then logs out', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/login').type('form')
      .send({ email: 'student@example.com', password: PASSWORD });
    expect(login.status).toBe(302);
    expect(login.headers.location).toBe('/dashboard');

    const home = await agent.get('/');
    expect(home.text).toContain('Test Student');
    expect(home.text).toContain('action="/logout"');

    const logout = await agent.post('/logout');
    expect(logout.status).toBe(302);
    const after = await agent.get('/dashboard');
    expect(after.status).toBe(302);
    expect(after.headers.location).toBe('/login?next=%2Fdashboard');
  });

  test('the seeded demo account can log in', async () => {
    const res = await request(app).post('/login').type('form')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    expect(res.status).toBe(302);
  });

  test('sends the user back to the page they asked for, but only on this site', async () => {
    const agent = request.agent(app);
    const ok = await agent.post('/login').type('form')
      .send({ email: 'student@example.com', password: PASSWORD, next: '/courses' });
    expect(ok.headers.location).toBe('/courses');

    const evil = await request(app).post('/login').type('form')
      .send({ email: 'student@example.com', password: PASSWORD, next: '//evil.example.com' });
    expect(evil.headers.location).toBe('/dashboard');
  });
});

describe('protected routes', () => {
  test.each(['/dashboard', '/courses', '/courses/new', '/assignments/new', '/assignments/search'])(
    'logged-out visitors to %s are redirected to log in',
    async (path) => {
      const res = await request(app).get(path);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`/login?next=${encodeURIComponent(path)}`);
    }
  );

  test('public pages stay public', async () => {
    for (const path of ['/', '/about', '/login', '/register']) {
      expect((await request(app).get(path)).status).toBe(200);
    }
  });

  test('logged-in users are sent from /login to the dashboard', async () => {
    const agent = request.agent(app);
    await agent.post('/login').type('form').send({ email: 'student@example.com', password: PASSWORD });
    const res = await agent.get('/login');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });
});
