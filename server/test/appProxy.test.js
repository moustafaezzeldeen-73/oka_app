import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';

process.env.SESSION_SECRET = 's'.repeat(40);
process.env.SHOPIFY_STORE_DOMAIN = 'test.myshopify.com';
process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = 'shpat_test';
process.env.SHOPIFY_APP_PROXY_SECRET = 'proxy-secret-for-tests';
delete process.env.TEST_LOGIN_KEY;
delete process.env.STAFF_DEBUG_KEY;

const { createApp } = await import('../app.js');
const { proxySignature, verifyProxyRequest } = await import('../auth/appProxy.js');

/**
 * The website's requests, as Shopify's App Proxy would send them: signed
 * with the app secret, carrying the storefront's signed-in customer.
 */
function signed(path, { customer = '1', shop = 'test.myshopify.com', ts = Math.floor(Date.now() / 1000), extra = {} } = {}) {
  const params = new URLSearchParams({ ...extra, shop, logged_in_customer_id: customer, path_prefix: '/apps/oka', timestamp: String(ts) });
  params.set('signature', proxySignature(params.toString(), process.env.SHOPIFY_APP_PROXY_SECRET));
  return `/proxy${path}?${params}`;
}

/** The real app, with Shopify faked: order #1001 belongs to customer 1. */
const realFetch = globalThis.fetch;
const shopifyCalls = [];
let server;
let base;

before(async () => {
  globalThis.fetch = async (url, init) => {
    if (!new URL(String(url)).hostname.endsWith('myshopify.com')) return realFetch(url, init);
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
    if (query.includes('OkaOrderCancel')) {
      data = { orderCancel: { job: { id: 'gid://shopify/Job/1' }, orderCancelUserErrors: [] } };
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

const post = (path) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });

test('the signature follows Shopify: repeated keys joined, key=value pairs sorted', () => {
  const search = 'b=2&a=1&a=3&signature=ignored';
  const expected = crypto.createHmac('sha256', 'k').update('a=1,3b=2').digest('hex');
  assert.equal(proxySignature(search, 'k'), expected);
});

test('a verified request carries the storefront customer', () => {
  const params = new URLSearchParams({ shop: 'test.myshopify.com', logged_in_customer_id: '42', timestamp: String(Math.floor(Date.now() / 1000)) });
  params.set('signature', proxySignature(params.toString(), process.env.SHOPIFY_APP_PROXY_SECRET));
  assert.deepEqual(verifyProxyRequest(params.toString()), { ok: true, customerNumericId: '42' });
});

test('a tampered customer id is refused', () => {
  const params = new URLSearchParams({ shop: 'test.myshopify.com', logged_in_customer_id: '42', timestamp: String(Math.floor(Date.now() / 1000)) });
  params.set('signature', proxySignature(params.toString(), process.env.SHOPIFY_APP_PROXY_SECRET));
  params.set('logged_in_customer_id', '43');
  assert.equal(verifyProxyRequest(params.toString()).ok, false);
});

test('the website can cancel its signed-in customer’s own order', async () => {
  const res = await post(signed('/orders/%231001/cancel', { customer: '1' }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal((await res.json()).cancelled, true);
});

test('another storefront customer gets "not found", as in the app', async () => {
  const res = await post(signed('/orders/%231001/cancel', { customer: '2' }));
  assert.equal(res.status, 404);
});

test('a guest on the website is not signed in', async () => {
  const res = await post(signed('/orders/%231001/cancel', { customer: '' }));
  assert.equal(res.status, 401);
  assert.match((await res.json()).error, /not signed in/);
});

test('a bad signature, a stale timestamp or another shop is refused before any route runs', async () => {
  const before = shopifyCalls.length;
  const bad = signed('/orders/%231001/cancel').replace(/signature=[0-9a-f]+/, `signature=${'0'.repeat(64)}`);
  assert.equal((await post(bad)).status, 401);
  assert.equal((await post(signed('/orders/%231001/cancel', { ts: Math.floor(Date.now() / 1000) - 3600 }))).status, 401);
  assert.equal((await post(signed('/orders/%231001/cancel', { shop: 'other.myshopify.com' }))).status, 401);
  assert.equal(shopifyCalls.length, before);
});

test('the app’s own token routes are unchanged', async () => {
  const res = await post('/orders/%231001/cancel');
  assert.equal(res.status, 401);
});
