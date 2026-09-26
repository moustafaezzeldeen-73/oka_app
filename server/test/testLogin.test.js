import assert from 'node:assert/strict';
import { test } from 'node:test';

const { testLoginEnabled } = await import('../testLogin.js');

test('test login needs a long key and is never on in production', () => {
  const saved = { key: process.env.TEST_LOGIN_KEY, env: process.env.NODE_ENV };
  try {
    delete process.env.TEST_LOGIN_KEY;
    process.env.NODE_ENV = 'development';
    assert.equal(testLoginEnabled(), false);

    process.env.TEST_LOGIN_KEY = 'short';
    assert.equal(testLoginEnabled(), false);

    process.env.TEST_LOGIN_KEY = 'a-long-enough-test-key';
    assert.equal(testLoginEnabled(), true);

    process.env.NODE_ENV = 'production';
    assert.equal(testLoginEnabled(), false);
  } finally {
    if (saved.key === undefined) delete process.env.TEST_LOGIN_KEY;
    else process.env.TEST_LOGIN_KEY = saved.key;
    process.env.NODE_ENV = saved.env;
  }
});
