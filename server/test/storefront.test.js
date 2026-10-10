import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.SESSION_SECRET = 's'.repeat(40);
process.env.SHOPIFY_STORE_DOMAIN = 'test.myshopify.com';
process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = 'shpat_test';
process.env.STOREFRONT_TOKEN_SECRET = 'k'.repeat(40);
process.env.ALLOWED_ORIGIN = 'https://www.okaegypt.com, https://okaegypt.com';
delete process.env.TEST_LOGIN_KEY;
delete process.env.STAFF_DEBUG_KEY;

const { createApp } = await import('../app.js');
const { storefrontSignature, verifyStorefrontToken } = await import('../auth/storefront.js');

/** What the theme renders for a signed-in customer (layout/theme.liquid). */
const tokenFor = (id, ts = Math.floor(Date.now() / 1000)) => `${id}.${ts}.${storefrontSignature(String(id), String(ts))}`;

/** Shopify faked: #1001 is customer 1's and unfulfilled, #1002 is customer 1's and fulfilled. */
const realFetch = globalThis.fetch;
const shopifyCalls = [];
let server;
let base;
const ORDERS = {
  '#1001': { id: 'gid://shopify/Order/1', name: '#1001', displayFulfillmentStatus: 'UNFULFILLED', customer: { id: 'gid://shopify/Customer/1' }, fulfillments: [] },
  '#1002': { id: 'gid://shopify/Order/2', name: '#1002', displayFulfillmentStatus: 'FULFILLED', customer: { id: 'gid://shopify/Customer/1' }, fulfillments: [] },
};

before(async () => {
  globalThis.fetch = async (url, init) => {
    if (!new URL(String(url)).hostname.endsWith('myshopify.com')) return realFetch(url, init);
    const { query, variables } = JSON.parse(init.body);
    shopifyCalls.push(query);
    let data = {};
    if (query.includes('OkaOrderStatus')) {
      const name = /name:"([^"]+)"/.exec(variables.q)?.[1];
      data = { orders: { edges: ORDERS[name] ? [{ node: ORDERS[name] }] : [] } };
    }
    if (query.includes('OkaOrderCancel')) data = { orderCancel: { job: { id: 'gid://shopify/Job/1' }, orderCancelUserErrors: [] } };
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

const cancel = (name, auth) =>
  fetch(`${base}/orders/${encodeURIComponent(name)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://www.okaegypt.com', ...(auth ? { Authorization: auth } : {}) },
    body: '{}',
  });

test('a token the theme signed verifies; a changed customer id does not', () => {
  const t = tokenFor(42);
  assert.deepEqual(verifyStorefrontToken(t), { ok: true, customerNumericId: '42' });
  assert.equal(verifyStorefrontToken(t.replace(/^42/, '43')).ok, false);
});

test('an old token is refused', () => {
  assert.equal(verifyStorefrontToken(tokenFor(42, Math.floor(Date.now() / 1000) - 25 * 3600)).ok, false);
});

test('the signed-in customer can cancel their own unfulfilled order', async () => {
  const res = await cancel('#1001', `Storefront ${tokenFor(1)}`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).cancelled, true);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://www.okaegypt.com');
});

test('a fulfilled order can no longer be cancelled', async () => {
  const res = await cancel('#1002', `Storefront ${tokenFor(1)}`);
  assert.equal(res.status, 409);
});

test('another customer gets "not found"', async () => {
  const res = await cancel('#1001', `Storefront ${tokenFor(2)}`);
  assert.equal(res.status, 404);
});

test('a forged token is refused before Shopify is touched', async () => {
  const before = shopifyCalls.length;
  const res = await cancel('#1001', `Storefront 1.${Math.floor(Date.now() / 1000)}.${'0'.repeat(64)}`);
  assert.equal(res.status, 401);
  assert.equal(shopifyCalls.length, before);
});

test('an origin that is not the store gets no CORS grant', async () => {
  const res = await fetch(`${base}/orders/%231001/cancel`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});
