import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.SESSION_SECRET = 's'.repeat(40);
process.env.SHOPIFY_STORE_DOMAIN = 'test.myshopify.com';
process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = 'shpat_test';
delete process.env.TEST_LOGIN_KEY;
delete process.env.STAFF_DEBUG_KEY;

const { createApp } = await import('../app.js');
const { issueToken } = await import('../auth/session.js');

/**
 * The real app on a random port, with Shopify faked: any order belongs to
 * customer 1, and every Admin API call is recorded.
 */
const realFetch = globalThis.fetch;
const shopifyCalls = [];
let server;
let base;

before(async () => {
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes('myshopify.com')) return realFetch(url, init);
    const { query } = JSON.parse(init.body);
    shopifyCalls.push(query);
    let data = {};
    if (query.includes('OkaOrderStatus')) {
      data = {
        orders: {
          edges: [{ node: { id: 'gid://shopify/Order/1', name: '#1001', displayFulfillmentStatus: 'UNFULFILLED', customer: { id: 'gid://shopify/Customer/1' }, fulfillments: [] } }],
        },
      };
    }
    return new Response(JSON.stringify({ data }), { status: 200 });
  };
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  globalThis.fetch = realFetch;
});

const call = (method, path, token, body) =>
  realFetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

test('customer data and order changes need a session', async () => {
  for (const [m, p] of [
    ['GET', '/customer/orders'],
    ['GET', '/customer/orders?identifier=%2B201001234567'],
    ['GET', '/customer/addresses?identifier=x'],
    ['POST', '/orders/%231001/cancel'],
    ['POST', '/orders/%231001/edit'],
    ['POST', '/orders'],
    ['GET', '/orders/status?order=%231001'],
    ['GET', '/loyalty'],
    ['POST', '/loyalty/redeem'],
    ['GET', '/subscriptions'],
  ]) {
    assert.equal((await call(m, p)).status, 401, `${m} ${p}`);
  }
});

test("another customer's order is 'not found', and nothing is cancelled", async () => {
  shopifyCalls.length = 0;
  const token = issueToken({ identifier: 'b', customerId: 'gid://shopify/Customer/2', via: 'otp' });
  const res = await call('POST', '/orders/%231001/cancel', token, {});
  assert.equal(res.status, 404);
  assert.ok(!shopifyCalls.some((q) => q.includes('orderCancel')));
});

test('debug routes are hidden without the staff key', async () => {
  assert.equal((await call('GET', '/debug/jt?order=%231001')).status, 404);
});

test('test login does not exist without TEST_LOGIN_KEY', async () => {
  assert.equal((await call('POST', '/auth/test-login', null, { identifier: 'x', key: 'y' })).status, 404);
});

test('the store policy is public', async () => {
  const res = await call('GET', '/storefront-config');
  assert.equal(res.status, 200);
  const cfg = await res.json();
  assert.deepEqual(cfg.paymentMethods, ['cod']);
  assert.equal(cfg.shipping.tierThreshold, 300);
  assert.equal(cfg.loyalty.earnPointsPerEgp, 1);
});
