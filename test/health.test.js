const test = require('node:test');
const assert = require('node:assert');
const app = require('../server');

test('GET /api/health returns 200', async () => {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.strictEqual(res.status, 200);
  } finally {
    server.close();
  }
});

test('GET / serves the Hello World page', async () => {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.strictEqual(res.status, 200);
    assert.match(await res.text(), /Hello World/);
  } finally {
    server.close();
  }
});
