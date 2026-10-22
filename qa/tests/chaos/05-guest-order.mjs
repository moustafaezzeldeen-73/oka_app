// SEC-06 runtime check + Scenario 6 (theme-level order lookup behaviour).
// Verifies: (a) a stored guest "last order" is shown to a later visitor on the same browser;
// (b) what request the browser sends when the order number / phone in the stored session token
// are changed, and whether the theme adds any client-side rate limiting.
// Every call is answered by the harness mock and logged; nothing leaves localhost.
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../../harness/pw.mjs';

const BASE = process.argv[2] || 'http://localhost:9440';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
fs.mkdirSync(OUT, { recursive: true });
const report = { base: BASE };
const apiLog = (s) => s.logs.external.filter((x) => /run\.app/.test(x.url)).map((x) => ({ url: x.url, status: x.status }));

// (a) SEC-06: shopper A leaves a snapshot in localStorage; shopper B (no sign-in) opens /pages/orders.
{
  const s = await launch({ baseURL: BASE, device: 'Pixel 7', locale: 'en', agent: 'chaos', mocks: 'success' });
  // Simulate the checkout pixel writing a snapshot with PII (synthetic values only).
  await s.page.addInitScript(() => {
    try {
      localStorage.setItem('oka.age', 'true'); localStorage.setItem('__qa_seeded', '1');
      localStorage.setItem('oka.lastCheckout', JSON.stringify({
        cartToken: 'tokA', checkoutToken: 'chkA', at: Date.now(),
        order: { placedAt: new Date().toISOString(), items: [{ title: 'OKA Cobra', quantity: 1, unitPrice: 189 }], itemsTotal: 189, shipping: 36, total: 225,
          phone: '0100QA0000', address: { name: 'Shopper A', phone: '0100QA0000', address1: '12 Example St', city: 'Nasr City', provinceCode: 'C' } },
      }));
    } catch {}
  });
  await s.goto('/pages/orders', { settle: 1200 });
  const shown = (await s.page.evaluate(() => document.querySelector('[data-guest-last]')?.innerText || '')).replace(/\s+/g, ' ').slice(0, 300);
  const hasActions = await s.page.evaluate(() => Boolean(document.querySelector('[data-g-edit],[data-g-cancel]')));
  const persisted = await s.page.evaluate(() => { try { return Boolean(JSON.parse(localStorage.getItem('oka.lastCheckout') || 'null')); } catch { return false; } });
  report.sec06 = { shownToNextVisitor: shown, editOrCancelOffered: hasActions, snapshotStillPersisted: persisted, apiCalls: apiLog(s) };
  await s.close();
}

// (b) What the browser sends. The guest path authenticates by opaque cart/checkout tokens, not by
// order number/phone — so change the token and watch the outgoing request body (captured via the mock log).
{
  const s = await launch({ baseURL: BASE, device: 'Pixel 7', locale: 'en', agent: 'chaos', mocks: 'success' });
  await s.page.addInitScript(() => { try { localStorage.setItem('oka.age', 'true'); localStorage.setItem('__qa_seeded', '1'); localStorage.setItem('oka.lastCheckout', JSON.stringify({ cartToken: 'other-token-guess', checkoutToken: 'another-guess', at: Date.now() })); } catch {} });
  const bodies = [];
  await s.page.route('**/mcp', async (route) => { try { bodies.push(JSON.parse(route.request().postData() || '{}')); } catch {} return route.continue(); });
  await s.goto('/pages/orders', { settle: 1200 });
  report.requestShape = { outgoing: bodies.map((b) => ({ method: b?.params?.name, args: Object.keys(b?.params?.arguments || {}), sentOrderNumber: b?.params?.arguments?.orderNumber ?? null, sentPhone: b?.params?.arguments?.phone ?? null, session: b?.params?.arguments?.session ?? null })) };
  await s.close();
}

// (c) Signed-in order view: the browser sends orderNumber + phone from the customer's own order
// (order-detail dataset). Record the request shape for a few orders.
{
  const s = await launch({ baseURL: BASE, device: 'Pixel 7', locale: 'en', agent: 'chaos', loggedIn: true, mocks: 'success' });
  const bodies = [];
  await s.page.route('**/mcp', async (route) => { try { bodies.push(JSON.parse(route.request().postData() || '{}')); } catch {} return route.continue(); });
  await s.goto('/pages/orders', { settle: 1400 });
  report.signedInRequests = bodies.map((b) => ({ method: b?.params?.name, hasOrderNumber: 'orderNumber' in (b?.params?.arguments || {}), hasPhone: 'phone' in (b?.params?.arguments || {}) }));
  await s.close();
}

// (d) Client-side rate limiting: fire many customer_get_order calls from the page in a loop and
// see whether the theme throttles before the request leaves (it does not; the server must).
{
  const s = await launch({ baseURL: BASE, device: 'Pixel 7', locale: 'en', agent: 'chaos', loggedIn: true, mocks: 'success' });
  let n = 0;
  await s.page.route('**/mcp', async (route) => { n++; return route.continue(); });
  await s.goto('/pages/orders', { settle: 800 });
  const fired = await s.page.evaluate(async () => {
    const O = window.OKA; const url = O.orders.url; let ok = 0;
    for (let i = 0; i < 25; i++) {
      try { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': O.orders.key }, body: JSON.stringify({ jsonrpc: '2.0', id: i, method: 'tools/call', params: { name: 'customer_get_order', arguments: { orderNumber: '#900010' + (i % 6 + 1), phone: '0100000000' + (i % 6 + 1) } } }) }); if (r.ok) ok++; } catch {}
    }
    return ok;
  });
  report.clientRateLimit = { pageRequestsObserved: n, loopAccepted: fired, note: 'theme does not throttle; each attempt reaches the endpoint (mock). Rate limiting must be server-side (see server auth/testLogin + ownership).' };
  await s.close();
}

fs.writeFileSync(path.join(OUT, '05-guest-order.json'), JSON.stringify(report, null, 1));
console.log('SEC-06 shownToNextVisitor:', report.sec06.shownToNextVisitor ? report.sec06.shownToNextVisitor.slice(0, 160) : '(empty)');
console.log('SEC-06 edit/cancel offered to next visitor:', report.sec06.editOrCancelOffered, '| snapshot persisted:', report.sec06.snapshotStillPersisted);
console.log('guest request shape:', JSON.stringify(report.requestShape));
console.log('signed-in request shape:', JSON.stringify(report.signedInRequests));
console.log('client rate limit:', JSON.stringify(report.clientRateLimit));
