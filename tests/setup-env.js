// Every test file gets its own empty in-memory database.
process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-secret';
