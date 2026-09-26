import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.SESSION_SECRET = 'x'.repeat(40);
const { issueToken, verifyToken, requireSession, SESSION_TTL_MS } = await import('../auth.js');

test('a token round-trips with the customer id', () => {
  const t = issueToken({ identifier: '+201001234567', customerId: 'gid://shopify/Customer/1', via: 'otp' });
  const s = verifyToken(t);
  assert.equal(s.customerId, 'gid://shopify/Customer/1');
  assert.equal(s.via, 'otp');
});

test('a tampered token is refused', () => {
  const t = issueToken({ identifier: 'a', customerId: 'gid://shopify/Customer/1', via: 'otp' });
  const [body, sig] = t.split('.');
  const forged = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), customerId: 'gid://shopify/Customer/2' }),
  ).toString('base64url');
  assert.equal(verifyToken(`${forged}.${sig}`), null);
  assert.equal(verifyToken('garbage'), null);
  assert.equal(verifyToken(''), null);
});

test('a token expires', (t) => {
  const token = issueToken({ identifier: 'a', customerId: 'gid://shopify/Customer/1', via: 'otp' });
  const now = Date.now();
  t.mock.method(Date, 'now', () => now + SESSION_TTL_MS + 1000);
  assert.equal(verifyToken(token), null);
});

test('requireSession refuses a missing token and a token without a customer', () => {
  const res = () => {
    const r = { code: 200, body: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
  };
  let r = res();
  requireSession({ headers: {} }, r, () => assert.fail('should not pass'));
  assert.equal(r.code, 401);

  r = res();
  const noCustomer = issueToken({ identifier: 'a', customerId: null, via: 'otp' });
  requireSession({ headers: { authorization: `Bearer ${noCustomer}` } }, r, () => assert.fail('should not pass'));
  assert.equal(r.code, 401);

  const good = issueToken({ identifier: 'a', customerId: 'gid://shopify/Customer/9', via: 'otp' });
  const req = { headers: { authorization: `Bearer ${good}` } };
  let passed = false;
  requireSession(req, res(), () => { passed = true; });
  assert.ok(passed);
  assert.equal(req.session.customerId, 'gid://shopify/Customer/9');
});
