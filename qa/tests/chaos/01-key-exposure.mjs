// Scenario 5 — key exposure proof (guest). Local harness only; the key value is the
// harness placeholder from qa/settings_data.live.json (never a real key).
// Usage: node qa/tests/chaos/01-key-exposure.mjs [baseURL]
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../../harness/pw.mjs';

const BASE = process.argv[2] || 'http://localhost:9440';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
fs.mkdirSync(OUT, { recursive: true });
const settings = JSON.parse(fs.readFileSync(new URL('../../settings_data.live.json', import.meta.url))).current;
const KEY = settings.orders_api_key; // placeholder string "REDACTED_LIVE_KEY_48_HEX"
const RUNAPP = new URL(settings.orders_api_url).hostname;

const pages = ['contact', 'about-us', 'how-to-use', 'online-store', 'faq', 'account', 'orders', 'addresses', 'loyalty', 'subscriptions', 'wishlist', 'support', 'checkout-review', 'track'];
const routes = [
  '/', '/collections', '/collections/all', '/collections/hookahs', '/collections/sale', '/collections/hookahs?page=2&sort_by=price-ascending',
  '/collections/all?view=oka-data', '/collections/all/products.json', '/collections/all?sections=main', '/collections/all?section_id=main',
  '/products/oka-cobra', '/products/oka-cobra?view=ar', '/products/oka-cobra.js', '/products/oka-cobra.json', '/products/oka-cobra?sections=main',
  '/products/foil' /* draft → 404 */, '/collections/hookahs/products/oka-cobra',
  ...pages.map((p) => `/pages/${p}`), '/pages/addresses?view=oka-add-address', '/pages/subscriptions?view=oka-subscribe',
  '/pages/orders?sections=main', '/pages/track?awb=JEGQA0000000001&order=%239000102',
  '/search?q=oka', '/search?q=%3Cscript%3E', '/search/suggest.json?q=oka', '/search/suggest?q=oka&section_id=predictive-search',
  '/recommendations/products.json?product_id=1&limit=4', '/cart', '/cart.js', '/cart?sections=main-cart', '/cart.js?sections=main-cart',
  '/account/login', '/account/register', '/account/login?return_url=/pages/orders', '/customer_authentication/login?return_to=/',
  '/policies/privacy-policy', '/policies/refund-policy', '/password', '/gift_cards/abc', '/this-does-not-exist', '/checkout',
  '/ar/', '/ar/pages/orders', '/ar/products/oka-cobra', '/ar/this-does-not-exist', '/robots.txt', '/sitemap.xml',
];

const count = (s, needle) => (s.split(needle).length - 1);
const rows = [];
for (const r of routes) {
  const res = await fetch(BASE + r, { headers: { cookie: 'qa_customer=0' }, redirect: 'manual' });
  const body = await res.text();
  rows.push({ route: r, status: res.status, type: (res.headers.get('content-type') || '').split(';')[0], keyHits: count(body, KEY), runAppHits: count(body, RUNAPP), hasWindowOKA: body.includes('window.OKA') });
}

// In the browser: window.OKA as a guest on each HTML route.
const s = await launch({ baseURL: BASE, device: 'Pixel 7', locale: 'en', agent: 'chaos' });
const browserRows = [];
for (const r of routes.filter((x) => !/\.js$|\.json|sections=|section_id=|view=oka-data|robots|sitemap|suggest|recommendations/.test(x))) {
  try {
    await s.goto(r, { settle: 150 });
    const o = await s.page.evaluate(() => {
      const O = window.OKA;
      if (!O) return { present: false };
      return { present: true, ordersKeyLen: O.orders?.key?.length ?? 0, jtKeyLen: O.jt?.key?.length ?? 0, sameKey: Boolean(O.orders?.key && O.orders.key === O.jt?.key), sameUrl: Boolean(O.orders?.url && O.orders.url === O.jt?.url), customer: O.customer ? 'signed-in' : null };
    });
    const k = await s.page.evaluate((K) => ({ inWindowOKA: JSON.stringify(window.OKA || {}).includes(K), inOkaGlobal: Boolean(window.Oka && JSON.stringify(window.Oka.CFG || {}).includes(K)) }), KEY);
    browserRows.push({ route: r, ...o, ...k });
  } catch (e) { browserRows.push({ route: r, error: e.message }); }
}
// Prove a guest page script can lift the key and call the API directly (mocked; never leaves localhost).
await s.goto('/');
s.clearLogs();
const replay = await s.page.evaluate(async () => {
  const O = window.OKA;
  const r = await fetch(O.jt.url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': O.jt.key }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'track_by_phone', arguments: { phone: '01000000000', lookbackDays: 60 } } }) });
  return { status: r.status, body: (await r.text()).slice(0, 200) };
});
await s.close();

const result = { base: BASE, keyPlaceholder: `${KEY.slice(0, 4)}… (${KEY.length} chars placeholder)`, httpRoutes: rows, browser: browserRows, replay };
fs.writeFileSync(path.join(OUT, '01-key-exposure.json'), JSON.stringify(result, null, 1));
const leaking = rows.filter((x) => x.keyHits > 0);
console.log(`HTTP routes tested: ${rows.length}; routes whose body contains the key placeholder: ${leaking.length}`);
for (const x of rows) console.log(`${String(x.status).padEnd(4)} ${x.type.padEnd(18)} key×${x.keyHits} runapp×${x.runAppHits} ${x.route}`);
console.log('--- browser window.OKA (guest)');
for (const x of browserRows) console.log(JSON.stringify(x));
console.log('--- replay from guest page context:', JSON.stringify(replay));
