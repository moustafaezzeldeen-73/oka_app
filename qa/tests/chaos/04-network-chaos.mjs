// Scenario 3 — network chaos on the fetch paths (cart change/add, search catalogue, orders API,
// J&T tracking): latency (3s/30s), 429 w/ Retry-After, 500, 502 HTML body, truncated JSON, CORS
// failure, offline toggle mid-request, out-of-order responses (slow-then-fast). Local only.
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../../harness/pw.mjs';

const BASE = process.argv[2] || 'http://localhost:9440';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
fs.mkdirSync(OUT, { recursive: true });
const report = { base: BASE, cases: [] };
const errs = (s) => ({ pageErrors: s.logs.pageErrors.map((e) => e.message), consoleErr: s.logs.console.filter((c) => c.type === 'error').map((c) => c.text).slice(0, 4) });

// Helper: install a local-route shim that mangles responses for matching URLs.
async function shim(s, match, handler) {
  await s.page.route(match, handler);
}

// 1) orders API via mock modes (truncated, 500, cors, timeout, sse, rpc-error) — guest last order path
for (const mode of ['malformed', 'error500', 'cors', 'timeout', 'sse', 'rpc-error', 'not-found', 'empty']) {
  const s = await launch({ baseURL: BASE, device: 'Pixel 7', locale: 'en', agent: 'chaos', mocks: `${mode}`, externalTimeoutMs: 3500 });
  // seed a guest last order so guestLastOrder() calls customer_get_order
  await s.page.addInitScript(() => { try { localStorage.setItem('oka.age', 'true'); localStorage.setItem('__qa_seeded', '1'); localStorage.setItem('oka.lastCheckout', JSON.stringify({ cartToken: 'qa-cart-tok', checkoutToken: 'qa-chk-tok', at: Date.now() })); } catch {} });
  try {
    await s.goto('/pages/orders', { settle: mode === 'timeout' ? 4200 : 1200 });
    const bodyText = (await s.page.evaluate(() => document.querySelector('[data-guest-last]')?.innerText || document.querySelector('#app')?.innerText || '')).slice(0, 140);
    report.cases.push({ path: 'orders:customer_get_order', mode, ...errs(s), rendered: bodyText, alive: await s.page.evaluate(() => Boolean(document.querySelector('#app'))) });
  } catch (e) { report.cases.push({ path: 'orders:customer_get_order', mode, error: e.message }); }
  await s.close();
}

// 2) J&T tracking page via mock modes
for (const mode of ['malformed', 'error500', 'timeout', 'empty', 'tool-error']) {
  const s = await launch({ baseURL: BASE, device: 'Pixel 7', locale: 'en', agent: 'chaos', mocks: `track_delivery:${mode},success`, externalTimeoutMs: 3500 });
  try {
    await s.goto('/pages/track?awb=JEGQA0000000001&order=%239000102', { settle: mode === 'timeout' ? 4200 : 1200 });
    const t = (await s.page.evaluate(() => document.querySelector('[data-track-body]')?.innerText || '')).slice(0, 120);
    report.cases.push({ path: 'jt:track_delivery', mode, ...errs(s), rendered: t });
  } catch (e) { report.cases.push({ path: 'jt:track_delivery', mode, error: e.message }); }
  await s.close();
}

// 3) 429 with Retry-After and 502 with HTML body on the orders endpoint (via local route shim)
for (const kind of ['429', '502html']) {
  const s = await launch({ baseURL: BASE, device: 'Pixel 7', locale: 'en', agent: 'chaos', mocks: 'success' });
  await s.page.addInitScript(() => { try { localStorage.setItem('oka.age', 'true'); localStorage.setItem('__qa_seeded', '1'); localStorage.setItem('oka.lastCheckout', JSON.stringify({ cartToken: 'qa-cart-tok', checkoutToken: 'qa-chk-tok', at: Date.now() })); } catch {} });
  await shim(s, '**/mcp', (route) => {
    if (kind === '429') return route.fulfill({ status: 429, headers: { 'retry-after': '120', 'content-type': 'application/json' }, body: '{"error":"rate limited"}' });
    return route.fulfill({ status: 502, headers: { 'content-type': 'text/html' }, body: '<html><head><title>502</title></head><body>Bad Gateway</body></html>' });
  });
  try {
    await s.goto('/pages/orders', { settle: 1200 });
    report.cases.push({ path: 'orders:customer_get_order', mode: kind, ...errs(s), rendered: (await s.page.evaluate(() => document.querySelector('[data-guest-last]')?.innerText || '')).slice(0, 120) });
  } catch (e) { report.cases.push({ path: 'orders', mode: kind, error: e.message }); }
  await s.close();
}

// 4) cart change under 3s latency, then offline — rapid user still clicks
{
  const s = await launch({ baseURL: BASE, device: 'Pixel 7', locale: 'en', agent: 'chaos', mocks: 'success' });
  await s.page.addInitScript(() => { try { localStorage.setItem('oka.age', 'true'); localStorage.setItem('__qa_seeded', '1'); } catch {} });
  await s.goto('/products/oka-cobra', { settle: 500 });
  // add once (fast), then slow all cart calls by 3s
  let slow = false;
  await shim(s, '**/cart/*.js', async (route) => { if (slow) await new Promise((r) => setTimeout(r, 3000)); return route.continue(); });
  await s.page.evaluate(() => document.querySelector('[data-buy],[data-add]')?.click());
  await s.page.waitForTimeout(600);
  slow = true;
  await s.page.evaluate(() => { const b = document.querySelector('[data-buy],[data-add]'); if (b) { b.click(); b.click(); } });
  await s.page.waitForTimeout(1000);
  // go offline mid-request
  await s.context.setOffline(true);
  await s.page.evaluate(() => document.querySelector('[data-buy],[data-add]')?.click());
  await s.page.waitForTimeout(1500);
  await s.context.setOffline(false);
  report.cases.push({ path: 'cart:add latency+offline', ...errs(s), requestFailed: s.logs.requestFailed.map((r) => r.failure).slice(0, 4) });
  await s.close();
}

// 5) out-of-order: first cart/change slow (3s), second fast — does stale response win?
{
  const s = await launch({ baseURL: BASE, device: 'Pixel 7', locale: 'en', agent: 'chaos', mocks: 'success' });
  await s.page.addInitScript(() => { try { localStorage.setItem('oka.age', 'true'); localStorage.setItem('__qa_seeded', '1'); } catch {} });
  await s.goto('/products/oka-cobra', { settle: 500 });
  // add to cart, then go to cart page
  await s.page.evaluate(() => document.querySelector('[data-buy],[data-add]')?.click());
  await s.page.waitForTimeout(500);
  let n = 0;
  await shim(s, '**/cart/change.js', async (route) => { n++; if (n === 1) await new Promise((r) => setTimeout(r, 2500)); return route.continue(); });
  await s.goto('/cart', { settle: 600 });
  // tap + then - quickly on the cart line; first (+) is delayed, second (-) fast
  await s.page.evaluate(() => { const inc = document.querySelector('[data-step="1"]'); const dec = document.querySelector('[data-step="-1"]'); inc && inc.click(); dec && dec.click(); });
  await s.page.waitForTimeout(3200);
  const shown = await s.page.evaluate(() => document.querySelector('.line')?.getAttribute('data-qty') || document.querySelector('[data-qty]')?.getAttribute('data-qty'));
  const serverCart = await (await fetch(BASE + '/cart.js', { headers: { cookie: (await s.context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ') } })).json().catch(() => ({}));
  report.cases.push({ path: 'cart:change out-of-order', ...errs(s), shownQty: shown, serverItemCount: serverCart.item_count });
  await s.close();
}

fs.writeFileSync(path.join(OUT, '04-network-chaos.json'), JSON.stringify(report, null, 1));
console.log(`network cases: ${report.cases.length}`);
for (const c of report.cases) console.log(`${(c.path + ' [' + c.mode + ']').padEnd(44)} err=${JSON.stringify(c.pageErrors || c.error || [])} cerr=${JSON.stringify(c.consoleErr || [])} => ${c.rendered || c.shownQty || JSON.stringify(c.requestFailed) || ''}`);
