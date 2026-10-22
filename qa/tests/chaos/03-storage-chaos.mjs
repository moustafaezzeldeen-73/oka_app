// Scenario 2 — storage chaos. For every theme storage key: corrupt / missing / oversized /
// wrong-typed values; quota-exceeded (setItem throws); storage disabled (getItem throws, like
// Safari private); cookies disabled; sessionStorage cleared mid-flow; two concurrent writers.
// Drives the real theme JS in Chromium against the shared harness. Local only.
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../../harness/pw.mjs';

const BASE = process.argv[2] || 'http://localhost:9440';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
fs.mkdirSync(OUT, { recursive: true });

const localKeys = ['oka.lang', 'oka.age', 'oka.addr', 'oka.afterAddress', 'oka.afterSignIn', 'oka.cancelled', 'oka.filters', 'oka.lastCheckout', 'oka.lastOrder', 'oka.pendingCode', 'oka.rated', 'oka.sort', 'oka.vouchers', 'oka.wishlist'];
const sessionKeys = ['oka.catalogue', 'oka.editingSub', 'oka.recShown', 'oka.viewed'];
const BAD = ['null', '{}', '"a string"', '{not json', '"' + 'ش'.repeat(20000) + '"'];
// page that most exercises each key
const keyRoute = {
  'oka.wishlist': '/collections/hookahs', 'oka.viewed': '/products/oka-cobra', 'oka.catalogue': '/search?q=oka',
  'oka.lastCheckout': '/pages/orders', 'oka.lastOrder': '/pages/orders', 'oka.rated': '/pages/orders',
  'oka.cancelled': '/pages/orders', 'oka.filters': '/collections/hookahs', 'oka.sort': '/collections/hookahs',
  'oka.vouchers': '/pages/loyalty', 'oka.pendingCode': '/cart', 'oka.addr': '/pages/checkout-review',
  'oka.age': '/', 'oka.lang': '/', 'oka.afterAddress': '/pages/addresses', 'oka.afterSignIn': '/pages/account',
  'oka.editingSub': '/pages/subscriptions', 'oka.recShown': '/products/oka-cobra',
};

const report = { base: BASE, corrupt: [], modes: [] };

async function withSeed(seed, loggedIn = false) {
  const s = await launch({ baseURL: BASE, device: 'Pixel 7', locale: 'en', loggedIn, agent: 'chaos', ageConfirmed: false });
  await s.page.addInitScript(seed);
  return s;
}

// 1) corrupt value per key
for (const key of [...localKeys, ...sessionKeys]) {
  const isSession = sessionKeys.includes(key);
  const route = keyRoute[key] || '/';
  const loggedIn = /orders|checkout|loyalty|account|subscriptions/.test(route);
  for (const bad of BAD) {
    const seed = `try{ (${isSession ? 'sessionStorage' : 'localStorage'}).setItem(${JSON.stringify(key)}, ${JSON.stringify(bad)}); localStorage.setItem('oka.age','true'); localStorage.setItem('__qa_seeded','1'); }catch(e){}`;
    const s = await withSeed(seed, loggedIn);
    let rec;
    try {
      await s.goto(route, { settle: 600 });
      const alive = await s.page.evaluate(() => Boolean(document.querySelector('#app')) && document.body.innerText.length > 0);
      rec = { key, store: isSession ? 'session' : 'local', bad: bad.length > 40 ? bad.slice(0, 20) + `…(${bad.length})` : bad, route, pageErrors: s.logs.pageErrors.map((e) => e.message), appAlive: alive };
    } catch (e) { rec = { key, bad: bad.slice(0, 20), route, error: e.message }; }
    report.corrupt.push(rec);
    await s.close();
  }
}

// 2) quota exceeded: setItem throws QuotaExceededError
{
  const seed = `localStorage.setItem('oka.age','true'); localStorage.setItem('__qa_seeded','1');
    var _si = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v){ if(String(k).indexOf('oka.')===0 && k!=='oka.age' && k!=='__qa_seeded'){ var e=new DOMException('quota','QuotaExceededError'); throw e;} return _si.call(this,k,v); };`;
  for (const route of ['/collections/hookahs', '/products/oka-cobra', '/cart', '/']) {
    const s = await withSeed(seed);
    await s.goto(route, { settle: 500 });
    // attempt an action that writes storage (toggle wishlist heart)
    await s.page.evaluate(() => document.querySelector('[data-heart]')?.click());
    await s.page.waitForTimeout(200);
    report.modes.push({ mode: 'quota-exceeded', route, pageErrors: s.logs.pageErrors.map((e) => e.message), console: s.logs.console.filter((c) => c.type === 'error').map((c) => c.text).slice(0, 3), alive: await s.page.evaluate(() => Boolean(document.querySelector('#app'))) });
    await s.close();
  }
}

// 3) storage disabled: getItem/setItem throw (Safari private mode style)
{
  const seed = `Object.defineProperty(window,'localStorage',{configurable:true,get(){ throw new DOMException('denied','SecurityError'); }});
    Object.defineProperty(window,'sessionStorage',{configurable:true,get(){ throw new DOMException('denied','SecurityError'); }});`;
  for (const route of ['/', '/collections/hookahs', '/products/oka-cobra', '/cart', '/search?q=oka', '/pages/orders']) {
    const s = await withSeed(seed, /orders/.test(route));
    let rec;
    try { await s.goto(route, { settle: 500 }); rec = { mode: 'storage-disabled', route, pageErrors: s.logs.pageErrors.map((e) => e.message), alive: await s.page.evaluate(() => Boolean(document.querySelector('#app'))) }; }
    catch (e) { rec = { mode: 'storage-disabled', route, error: e.message }; }
    report.modes.push(rec);
    await s.close();
  }
}

// 4) cookies disabled (no qa_sid persistence) — emulate by clearing cookies before each nav
{
  const s = await withSeed(`localStorage.setItem('oka.age','true');localStorage.setItem('__qa_seeded','1');`);
  await s.context.clearCookies();
  await s.goto('/products/oka-cobra', { settle: 500 });
  await s.page.evaluate(() => document.querySelector('[data-buy],[data-add]')?.click());
  await s.page.waitForTimeout(400);
  await s.context.clearCookies();
  await s.goto('/cart', { settle: 500 });
  report.modes.push({ mode: 'cookies-cleared-between-navs', pageErrors: s.logs.pageErrors.map((e) => e.message), cartText: (await s.page.evaluate(() => document.querySelector('#app')?.innerText || '')).slice(0, 120) });
  await s.close();
}

// 5) sessionStorage cleared mid-flow (catalogue warmed then wiped), then search
{
  const s = await withSeed(`localStorage.setItem('oka.age','true');localStorage.setItem('__qa_seeded','1');`);
  await s.goto('/search?q=oka', { settle: 800 });
  await s.page.evaluate(() => sessionStorage.clear());
  await s.page.evaluate(() => { const i = document.querySelector('[data-search] input, input[data-search], [data-results]') ? document.querySelector('input[type=search],[data-search]') : null; });
  await s.page.fill('input[type=search], [data-search] input, input[data-search]', 'cobra').catch(() => {});
  await s.page.waitForTimeout(600);
  report.modes.push({ mode: 'sessionStorage-cleared-midflow', pageErrors: s.logs.pageErrors.map((e) => e.message), results: (await s.page.evaluate(() => document.querySelector('[data-results]')?.innerText || '')).slice(0, 80) });
  await s.close();
}

// 6) two concurrent tabs writing oka.wishlist
{
  const s = await withSeed(`localStorage.setItem('oka.age','true');localStorage.setItem('__qa_seeded','1');`);
  const p2 = await s.context.newPage();
  await s.goto('/collections/hookahs', { settle: 500 });
  await p2.goto(BASE + '/collections/hookahs', { waitUntil: 'load' }); await p2.waitForTimeout(400);
  // both toggle hearts quickly
  await Promise.all([
    s.page.evaluate(() => { document.querySelectorAll('[data-heart]').forEach((b, i) => { if (i < 4) b.click(); }); }),
    p2.evaluate(() => { document.querySelectorAll('[data-heart]').forEach((b, i) => { if (i >= 2 && i < 6) b.click(); }); }),
  ]);
  await s.page.waitForTimeout(300);
  const w1 = await s.page.evaluate(() => { try { return JSON.parse(localStorage.getItem('oka.wishlist') || '{}'); } catch { return 'unreadable'; } });
  report.modes.push({ mode: 'two-tabs-wishlist', finalWishlist: w1, pageErrors: s.logs.pageErrors.map((e) => e.message) });
  await s.close();
}

fs.writeFileSync(path.join(OUT, '03-storage-chaos.json'), JSON.stringify(report, null, 1));
const crashes = report.corrupt.filter((r) => (r.pageErrors || []).length || r.error || r.appAlive === false);
console.log(`corrupt-value cases: ${report.corrupt.length}; with page errors / dead app: ${crashes.length}`);
for (const r of crashes) console.log(`CRASH key=${r.key} store=${r.store} bad=${r.bad} route=${r.route} errs=${JSON.stringify(r.pageErrors || r.error)} alive=${r.appAlive}`);
console.log('--- modes');
for (const m of report.modes) console.log(`${(m.mode).padEnd(30)} route=${m.route || ''} errs=${JSON.stringify(m.pageErrors || m.error || [])} alive=${m.alive} extra=${m.console ? JSON.stringify(m.console) : (m.cartText || m.results || JSON.stringify(m.finalWishlist) || '')}`);
