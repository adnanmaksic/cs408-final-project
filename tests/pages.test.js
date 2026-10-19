const request = require('supertest');
const app = require('../app');

describe('pages', () => {
  test('GET /api/health returns 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET / renders the landing page inside the shared layout', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Every assignment. Every grade. One place.');
    expect(res.text).toContain('href="/register"');
    expect(res.text).toContain('href="/login"');
    expect(res.text).toContain('<nav class="navbar');
  });

  test('GET /about renders the About page', async () => {
    const res = await request(app).get('/about');
    expect(res.status).toBe(200);
    expect(res.text).toContain('How grades are calculated');
    expect(res.text).toContain('Frequently asked questions');
  });

  test('planned pages show a placeholder', async () => {
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Work in Progress');
  });

  test('unknown pages return 404', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.text).toContain('Page not found');
  });
});
