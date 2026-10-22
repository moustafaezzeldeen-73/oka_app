// Focused re-run of the cart network cases from 04 with request counting and UI capture.
import fs from 'node:fs';
import { launch } from '../../harness/pw.mjs';
const BASE = process.argv[2] || 'http://localhost:9440';
const out = {};
const cookieHdr = async (s) => (await s.context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
const serverCart = async (s) => (await (await fetch(BASE + '/cart.js', { headers: { cookie: await cookieHdr(s) } })).json());
const seed = () => { try { localStorage.setItem('oka.age', 'true'); localStorage.setItem('__qa_seeded', '1'); } catch {} };

// A) 3s latency on add, double tap, then offline tap
{
  const s = await launch({ baseURL: BASE, device: 'Pixel 7', locale: 'en', agent: 'chaos' });
  await s.page.addInitScript(seed);
  const calls = [];
  let delay = 0;
  await s.page.route('**/cart/**', async (r) => { calls.push(r.request().url().replace(BASE, '')); if (delay) await new Promise((x) => setTimeout(x, delay)); return r.continue().catch(() => {}); });
  await s.goto('/products/oka-cobra', { settle: 500 });
  delay = 3000;
  await s.page.evaluate(() => document.querySelector('[data-buy]').click()); await s.page.evaluate(() => document.querySelector('[data-buy]').click());
  await s.page.waitForTimeout(7000);
  const afterLatency = (await serverCart(s)).item_count;
  delay = 0;
  await s.context.setOffline(true);
  await s.page.evaluate(() => document.querySelector('[data-buy]').click());
  await s.page.waitForTimeout(1500);
  const alertTxt = await s.page.evaluate(() => document.querySelector('.alert')?.innerText || null);
  await s.page.screenshot({ path: 'qa/reports/screenshots/chaos/offline-add-alert.png' });
  await s.context.setOffline(false);
  out.latencyOffline = { addCallsDuringLatency: calls.filter((u) => /add\.js/.test(u)).length, cartAfterDoubleTapUnderLatency: afterLatency, offlineAlert: alertTxt, pageErrors: s.logs.pageErrors.map((e) => e.message) };
  await s.close();
}

// B) out-of-order: cart page, + (slow 2.5s) then − (fast)
{
  const s = await launch({ baseURL: BASE, device: 'Pixel 7', locale: 'en', agent: 'chaos' });
  await s.page.addInitScript(seed);
  await s.goto('/products/oka-cobra', { settle: 500 });
  await s.page.evaluate(() => document.querySelector('[data-buy]').click()); await s.page.waitForTimeout(1200);
  await s.page.evaluate(() => document.querySelector('[data-buy]').click()); await s.page.waitForTimeout(1200); // qty 2
  let n = 0; const sent = [];
  await s.page.route('**/cart/change.js', async (r) => { n++; sent.push(JSON.parse(r.request().postData() || '{}').quantity); if (n === 1) await new Promise((x) => setTimeout(x, 2500)); return r.continue(); });
  await s.goto('/cart', { settle: 800 });
  const before = (await serverCart(s)).item_count;
  await s.page.evaluate(() => { document.querySelector('.line [data-step="1"]')?.click(); document.querySelector('.line [data-step="-1"]')?.click(); });
  await s.page.waitForTimeout(4000);
  const shown = await s.page.evaluate(() => document.querySelector('.line')?.dataset.qty);
  out.outOfOrder = { qtyBefore: before, quantitiesSent: sent, serverQtyAfter: (await serverCart(s)).item_count, shownQtyAfter: shown, expected: before, pageErrors: s.logs.pageErrors.map((e) => e.message) };
  await s.close();
}
fs.writeFileSync('qa/tests/chaos/out/04b-cart-network.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
